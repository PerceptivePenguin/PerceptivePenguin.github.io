---  
blog: _posts  
tags:  
  - Golang  
share: true  
---  
  
In creating [Damon](https://github.com/jet/damon), the supervisor application that constrains Jet’s Windows microservices in [Nomad](https://nomadproject.io/), we had to interact directly with the Windows API. The Windows API grants access to the more advanced features of the OS, including creation and configuration of JobObjects and Security Token manipulation. Fortunately, Go provides a way to talk to the OS via the `syscall` package. Unfortunately, in order to make use of most of the APIs, we need to rely on `unsafe` memory management.  
  
What I’ll try to do in this post is document some patterns that we discovered when writing Damon for interacting with the Windows API, so that you have a starting point if you find yourself in this situation.  
  
# The “syscall” package  
  
The Go `syscall` library is different depending on the OS / architecture which the Go compiler is targeting. Because the functions and types available change depending on the compilation target, you MUST ALWAYS use _Conditional Compilation_ with either build tags or special file name suffixes when importing `syscall`. Dave Cheney has a nice [Blog Post](https://dave.cheney.net/2013/10/12/how-to-use-conditional-compilation-with-the-go-build-tool) explaining this feature in depth, but in short:  
  
- If your file name follows the structure `name_{GOOS}_{GOARCH}.go` or simply `name_{GOOS}.go` , then it will be compiled only under the target OS+architecture or OS+any architecture respectively without needing a special comment. For example; `myfile_windows_amd64.go` will only be compiled for binaries targeting Windows OS on amd64 CPU architectures, whereas a file named `myfile_windows.go` will be compiled for binaries targeting the Windows OS regardless of CPU architecture.  
- If you add `// +build windows,amd64` at the top of your go file, it will only build this source file when `GOOS=windows` and `GOARCH=amd64`. This supports more complicated boolean logic than the file suffix variant, although that complexity is _usually_ not warranted.  
  
# Let’s talk about “unsafe”  
  
Actually, lets have Rob Pike talk about it first:  
  
> With the unsafe package there are no guarantees.  
>   
> — “[Go Proverbs](https://www.youtube.com/watch?v=PAAkCSZUG1c&feature=youtu.be&t=830)” by Rob Pike  
  
What does “no guarantees” mean?  
  
1. Go (the runtime) does not guarantee go built-in types such as slices and strings will have the same in-memory structure between releases. As a Garbage-collected language, Go also hides memory management details from the developer. `unsafe` exposes some of the inner-workings and actual memory addresses, and can do unexpected things like move the values that a raw pointer address may point to if you are not careful (and some times — even if you are).  
2. Go (the language) does not guarantee that versions of Go will have the same behavior or function signatures between releases. In other words, `unsafe` is not covered by the [Go 1.x compatibility promise](https://golang.org/doc/go1compat).  
  
> **Warning:** Avoid `unsafe` like the plague; if you can help it.  
  
Both of these things mean that, when using features of the `unsafe` package, we have to be very careful about how we use it. We must read what is and is not allowed by Go when interacting with memory in an unsafe way; and this may even change between versions of Go! The [Godoc](https://golang.org/pkg/unsafe/) page has a lot of examples of what IS and IS NOT valid that should be heeded always.  
  
**Note:** Technically, `syscall` is _also_ outside the Go 1.x compatibility promise, since it is impossible to guarantee that an OS will never change in a backwards-incompatible way. However, as of Go 1.4 — the library is frozen and should only change if an underlying OS change forces it. Calling exported Windows DLL procedures is unlikely to change, so we should be reasonably safe.  
  
Any evolution of Windows OS system calls in Go 1.x is now done in `[golang.org/x/sys/windows](https://godoc.org/golang.org/x/sys/windows)` . This package defines a variety of API functions that allow you to take advantage of the collective work & knowledge of the Go team and contributors. However, using this package comes with a few caveats:  
  
1. It is also not under the go1compat promise, and so may break your code if you depend on it. Still, you can pin to a specific git revision if you want to remain stable.  
2. The stated goal of the package is not to expose every Windows API function, but serve as a dependency for OS-specific implementations needed in standard library packages such as `os` and `net` since `syscall` is frozen. Therefore, neither this package, nor `syscall` will likely be feature-complete with respect to all OS functionality you may require.  
  
That being said, if it has implemented all the functions and types you need, Fantastic! Use It, but know the risks.  
  
# The Windows API  
  
Microsoft provides documentation for much of the [Windows API](https://docs.microsoft.com/en-us/windows/desktop/apiindex/api-index-portal). APIs are published via DLLs delivered with each installation of the Windows OS. The specific DLLs and API Functions available depend on the version of Windows, but the API documentation will list when the API was introduced and also when the API was deprecated/removed.  
  
## Loading DLLs  
  
To Load a DLL in Go, you can use `syscall.NewLazyDLL` or `syscall.LoadLibrary` . The “Lazy” variant returns a `*LazyDLL` which only loads the library the first time a call is made to one of its functions; whereas `LoadLibrary` immediately loads the DLL. There also exists safe DLL loading methods in `golang.org/x/sys/windows` such as `windows.NewLazySystemDLL` which ensures that the DLL search path is constrained to the Windows System directory.  
  
## Calling Procedures  
  
After the DLL is loaded (or lazy-loaded), you then must get a reference to the the Procedure using `dll.NewProc("ProcName")` .  
  
```go  
var (    
    kernel32DLL = syscall.NewLazyDLL("kernel32.dll")    
    procOpenProcess = kernel32DLL.NewProc("OpenProcess")    
)  
```  
  
Once you have some variable that references the DLL procedure, you can make the API call using either the `Call` method on the procedure itself, or using the `syscall.Syscall` function (and variants thereof). I find the `Call` method more convenient, but for performance it might be better to use `syscall.Syscall` directly. There are variants of this function depending on how many parameters the procedure requires (its “arity”).  
  
- `syscall.Syscall` : less than 4 arguments  
- `syscall.Syscall6`: 4 to 6 arguments  
- `syscall.Syscall9`: 7 to 9 arguments  
- `syscall.Syscall12`: 10 to 12 arguments  
- `syscall.Syscall15`: 13 to 15 arguments  
  
As recent as Go v1.11, it is not possible to call a procedure with more than 15 arguments. I’ve never encountered one, but they do exist [in OpenGL at least](https://github.com/golang/go/issues/28434).  
  
## API Call Signatures  
  
Before you can actually make a call to a DLL procedure, you must first understand the arguments, types, and sizes of the arguments the procedure expects. Microsoft describes this as part of the Windows API Documentation. For example, the call signature for CreateJobObjectA is:  
  
```go  
HANDLE CreateJobObjectA(    
  LPSECURITY_ATTRIBUTES lpJobAttributes,    
  LPCSTR                lpName    
);  
```  
  
This means, that CreateJobObjectA expects a pointer to a SECURITY_ATTRIBUTES structure, and a pointer to a C-String (ASCII-encoded, Technically [Windows-1252 encoded](https://en.wikipedia.org/wiki/Windows-1252); which is ASCII-compatible).  
  
# C Structs & Go Structs  
  
The [SECURITY_ATTRIBUTES](https://msdn.microsoft.com/en-us/56b5b350-f4b7-47af-b5f8-6a35f32c1009) structure is defined as:  
  
```go  
typedef struct _SECURITY_ATTRIBUTES {    
  DWORD  nLength;    
  LPVOID lpSecurityDescriptor;    
  BOOL   bInheritHandle;    
} SECURITY_ATTRIBUTES, *PSECURITY_ATTRIBUTES, *LPSECURITY_ATTRIBUTES;  
```  
So we have to make a Go structure that mirrors that. Fortunately, the `syscall` package [already made one for us](https://godoc.org/golang.org/x/sys/windows#SecurityAttributes).  
  
```go  
type SecurityAttributes struct {    
    Length             [uint32](https://godoc.org/builtin#uint32)    
    SecurityDescriptor [uintptr](https://godoc.org/builtin#uintptr)    
    InheritHandle      [uint32](https://godoc.org/builtin#uint32)    
}  
```  
  
From this, we know that a **DWORD** is a Go **uint32**, and a LPVOID (* void) is a Go **uintptr**. For structures that do not exist, you have to look up what the type definitions are and fill in the correct go type. You can find many examples in the `syscall` and `go.sys` libraries to help you out. Windows has a [types reference available](https://docs.microsoft.com/en-us/windows/desktop/WinProg/windows-data-types) which I’ve found quite useful in determining the analogous Go types for a few of the more common Windows C-Types:  
  
```go  
type (    
 BOOL          uint32    
 BOOLEAN       byte    
 BYTE          byte    
 DWORD         uint32    
 DWORD64       uint64    
 HANDLE        uintptr    
 HLOCAL        uintptr    
 LARGE_INTEGER int64    
 LONG          int32    
 LPVOID        uintptr    
 SIZE_T        uintptr    
 UINT          uint32    
 ULONG_PTR     uintptr    
 ULONGLONG     uint64    
 WORD          uint16    
)  
```  
  
# Strings  
  
In Windows, some procedures which take string arguments have two variants: one for ANSI-encoded, and one for UTF-16 encoded strings. For example, there are two CreateProcess procedures in `kernel32.dll`:  
  
```go  
var (    
    kernel32DLL = syscall.NewLazyDLL("kernel32.dll")    
    procCreateProcessA = kernel32DLL.NewProc("CreateProcessA")    
    procCreateProcessW = kernel32DLL.NewProc("CreateProcessW")    
)  
```  
  
Regardless of which you choose, neither of these string types are directly compatible with Go strings. In order to use them, you’ll need to construct compatible strings. Fortunately, this is relatively easy.  
  
For ANSI-encoded C strings, it is the raw string bytes with an addition null value appended to the end. With UTF-16 Strings, you have to ensure it is encoded properly to UTF-16 runes, and add a null rune as well; but it’s pretty much the same thing for both.  
  
```go  
package win32  
  
import "unicode/utf16"  
  
// StringToCharPtr converts a Go string into pointer to a null-terminated cstring.  
// This assumes the go string is already ANSI encoded.  
func StringToCharPtr(str string) *uint8 {  
	chars := append([]byte(str), 0) // null terminated  
	return &chars[0]  
}  
  
// StringToUTF16Ptr converts a Go string into a pointer to a null-terminated UTF-16 wide string.  
// This assumes str is of a UTF-8 compatible encoding so that it can be re-encoded as UTF-16.  
func StringToUTF16Ptr(str string) *uint16 {  
	wchars := utf16.Encode([]rune(str + "\x00"))	  
	return &wchars[0]  
}  
```  
  
# Calling the API  
  
Putting it all together, creating a JobObject using the Windows API looks like this:  
  
```go  
package win32  
  
import "syscall"  
import "unsafe"  
  
var (  
  kernel32DLL          = syscall.NewLazyDLL("kernel32.dll")  
  procCreateJobObjectA = kernel32DLL.NewProc("CreateJobObjectA")  
)  
  
// CreateJobObject uses the CreateJobObjectA Windows API Call to create and return a Handle to a new JobObject  
func CreateJobObject(attr *syscall.SecurityAttributes, name string) (syscall.Handle, error) {  
	r1, _, err := procCreateJobObjectA.Call(  
		uintptr(unsafe.Pointer(attr)),  
		uintptr(unsafe.Pointer(StringToCharPtr(name))),  
	)  
	if err != syscall.Errno(0) {  
		return 0, err  
	}  
	return syscall.Handle(r1), nil  
}  
```  
  
Calling any API follows this same formula.  
  
The `syscall.Syscall` function always returns `(r1,r2,err uintptr)`. Near as I can tell, for `windows_amd64` : `r1` is always the return value of the syscall, `r2` is unused, and `err` refers to the Windows error code returned by `GetLastError` , which is automatically called as part of the Syscall function.  
  
You must pass each argument in casted to a `uintptr`. No matter what the primitive type, every argument has to be treated this way. However, pointers are special.  
  
Since Go is garbage collected, Standard Go pointers do not directly point to a place in memory. The go runtime is free to change the physical memory location pointed at by a Go pointer, such as when it grows the stack. When a pointer is converted into a raw `uintptr` via `unsafe.Pointer` — it becomes just a number untracked by the Go runtime. That number may or may not point to a valid location in memory like it once did, even after the very next instruction!  
  
Because of this, you have to call Syscalls with pointers to memory in certain way. By using the `uintptr(unsafe.Pointer(&x))` construction in the argument list, you signal to the compiler that it can’t change the memory location for the duration of the syscall; thereby giving the C function the ability to treat the pointer like any other pointer to unmanaged memory until the Syscall returns.  
  
The ways in which you can and cannot use `unsafe.Pointers` are documented in the [godoc for unsafe.Pointer](https://golang.org/pkg/unsafe/#Pointer). In this instance, we are using use-case (4) “Conversion of a Pointer to a `uintptr` when calling `syscall.Syscall`”  
  
# Raw Memory  
  
Some times, the syscalls will fill a block of memory for you with C structures. In order to work with it, you’ll have to convert it into a usable type.  
  
The general pattern for many of these API calls are as follows:  
  
1. Allocate a byte buffer  
2. Make an API call with a pointer to that buffer, and a pointer to the variable containing the length of the buffer  
3. API returns ERROR_INSUFFICIENT_LENGTH, having updated the value of the length parameter to the required size.  
4. Extend the buffer to meet the new length requirement, and retry the syscall  
5. Repeat until Success  
  
Here is a concrete example calling [GetExtendedTcpTable](https://docs.microsoft.com/en-us/windows/desktop/api/iphlpapi/nf-iphlpapi-getextendedtcptable)  
  
```go  
package win32  
  
import (  
	"syscall"  
	"unsafe"  
)  
  
var (  
	iphlpapiDLL             = syscall.NewLazyDLL("iphlpapi.dll")  
	procGetExtendedTcpTable = iphlpapiDLL.NewProc("GetExtendedTcpTable")  
)  
  
// GetExtendedTcpTable calls the Windows API GetExtendedTcpTable and returns a raw byte buffer  
// containing the TCP Table requested. This buffer will need to be converted to the appropriate  
// Go structure for use, depending on the combination of ulAf and tableClass requested.  
func GetExtendedTcpTable(order uint32, ulAf uint32, tableClass uint32) ([]byte, error) {  
	var buffer []byte  
	var pTcpTable *byte  
	var dwSize uint32  
	for {  
		// DWORD GetExtendedTcpTable(  
		//  PVOID           pTcpTable,  
		//  PDWORD          pdwSize,  
		//  BOOL            bOrder,  
		//  ULONG           ulAf,  
		//  TCP_TABLE_CLASS TableClass,  
		//  ULONG           Reserved  
		// );  
		// https://docs.microsoft.com/en-us/windows/desktop/api/iphlpapi/nf-iphlpapi-getextendedtcptable  
		ret, _, errno := procGetExtendedTcpTable.Call(  
			uintptr(unsafe.Pointer(pTcpTable)),  
			uintptr(unsafe.Pointer(&dwSize)),  
			uintptr(order),  
			uintptr(ulAf),  
			uintptr(tableClass),  
			uintptr(uint32(0)),  
		)  
		if ret != 0 {  
			if syscall.Errno(ret) == syscall.ERROR_INSUFFICIENT_BUFFER {  
				buffer = make([]byte, int(dwSize))  
				pTcpTable = &buffer[0]  
				continue  
			}  
			return nil, syscall.Errno(errno)  
		}  
		return buffer, nil  
	}  
}  
```  
  
Once you have this buffer, You need to unsafe cast it into a structure of the appropriate type, depending on what the API documentation says. In this example, the type of the bytes returned depends heavily on what the input parameters were. For example, if the input parameters were AF_INET + TCP_TABLE_OWNER_PID_ALL, then the buffer returned would be a [MIB_TCPTABLE_OWNER_PID](https://docs.microsoft.com/en-us/windows/desktop/api/tcpmib/ns-tcpmib-_mib_tcptable_owner_pid) structure:  
  
```go  
typedef struct _MIB_TCPTABLE_OWNER_PID {    
  DWORD                dwNumEntries;    
  MIB_TCPROW_OWNER_PID table[ANY_SIZE];    
} MIB_TCPTABLE_OWNER_PID, *PMIB_TCPTABLE_OWNER_PID;  
```  
  
Which is a structure with a first element containing the number of Rows in the structure, and the rest is an in-line array of arbitrary size. Oh boy… how do we represent that in Go?  
  
We cheat.  
## Working with ANY_SIZE arrays  
  
We can create a compatible Go structure for casting this arbitrary array of bytes by using a property of arrays: they are laid out as contiguous blocks of memory with no envelope.  
  
```go  
type _MIB_TCPTABLE_OWNER_PID struct {    
  dwNumEntries uint32    
  table        [1]_MIB_TCPROW_OWNER_PID    
}    
type _MIB_TCPROW_OWNER_PID struct {    
  dwState      uint32    
  dwLocalAddr  [4]byte    
  dwLocalPort  uint32    
  dwRemoteAddr [4]byte    
  dwRemotePort uint32    
  dwOwningPid  uint32    
}  
```  
  
First, we need to cast our buffer into this go type, in order to know the length of the table. We do this using `unsafe.Pointer`  
  
```go  
pTable := (*_MIB_TCPTABLE_OWNER_PID)(unsafe.Pointer(&buf[0]))  
```  
  
What I’ve done here is get a pointer to the first byte of memory. Since I now have a pointer type, I can convert it into an `unsafe.Pointer` which can be coerced into a pointer of ANY ARBITRARY TYPE. This is extremely dangerous to do without knowing why you are allowed to do it. I’m allowed to do it in this case because I’m using the established pointer conversion pattern documented in unsafe.Pointer  
  
> (1) Conversion of a * T1 to Pointer to * T2.  
>   
> Provided that T2 is no larger than T1 and that the two share an equivalent memory layout, this conversion allows reinterpreting data of one type as data of another type.  
  
Now, I know what you’re thinking: The table `[1]_MIB_TCPROW_OWNER_PID` is obviously not the correct size. But that is OK: `[1]_MIB_TCPROW_OWNER_PID` is indeed **_no larger than_** `[1+N]_MIB_TCPROW_OWNER_PID` and does have the **_same memory layout_**. We’ll be using another `unsafe.Pointer` pattern to traverse the array, already knowing the size from `dwNumEnties` field.  
  
> (3) Conversion of a Pointer to a uintptr and back, with arithmetic.  
  
```go  
rows := make([]_MIB_TCPROW_OWNER_PID,int(pTable.dwNumEntries))  
for i := 0; i < int(pTable.dwNumEntries); i++ {  
	rows[i] = *(*_MIB_TCPROW_OWNER_PID)(unsafe.Pointer(  
		uintptr(unsafe.Pointer(&pTable.table[0])) +  
		uintptr(i) * unsafe.Sizeof(pTable.table[0])  
	))  
}  
```  
  
In this code fragment, we’re using the 3rd acceptable `unsafe.Pointer` rule to iterate through an array of known length since we know the location of the first element, the size of each element, how many elements exist in the array, and also that each structure is laid out contiguously in memory.  
  
This allows us to construct a more useful slice data structure, or work with each row directly in the for loop.  
  
There is also a more direct way of getting a slice of the correct length  
  
```go  
rows := ((*[1 << 30]_MIB_TCPROW_OWNER_PID)(unsafe.Pointer(&pTable.table[0]))[:int(pTable.dwNumEntries):int(pTable.dwNumEntries)])  
```  
  
This technique unsafe-casts the pointer to the first table entry into a pointer to a very large array of the same type. It then creates a slice backed by that array using the correct length & capacity. The benefit of this method is that this all happens in-place; there is no need to copy the structs into a new slice. The drawback is that it is not as portable as the other method; since maximum array size differs depending on the target platform.  
  
You can play around with a toy example of this in the [Go Playground](https://play.golang.org/p/1XN1bLer-se).  
  
# Now you can Win32!  
  
This is not all you need to know to interact with every Windows API, but this should be a good starting point for learning more about inter-operating with the Windows API using Go. If you’d like to apply what you’ve learned, the [Damon](https://github.com/jet/damon) project could use another contributor 😀.