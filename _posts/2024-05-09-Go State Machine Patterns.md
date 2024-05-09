---  
tags:  
  - Golang  
blog: _posts  
share: true  
---  
  
In many of the jobs I’ve had over the years, there has been a need to do sequential operations that depended on some operational state.  
  
Examples of this include:  
  
- Parsing configuration languages, programming languages, etc…  
- Executing operations on systems, routers, clusters, …  
- ETL (Extract Transform Load)  
  
A long time ago, I came across Rob Pike’s talk on [lexical scanning](https://www.youtube.com/watch?v=HxaD_trXwRE) in Go. This is a complex talk that took me a few views to really understand. But one of the most fundamental pieces of knowledge he introduces during the talk is his version of a Go state machine.  
  
This takes advantage of Go’s ability to make a type out of a function and assign a function to a variable.  
  
This state machine he introduces in that talk is powerful and breaks the logic of having functions do an **if/else** and call the next needed function. It replaces it with a version where each state returns the next function that should be called.  
  
This allows us to break the call chain into more easily testable parts.  
  
# A Call Chain  
  
Here is an example of accomplishing something with a simple call chain:  
  
```go  
func Caller(args Args) {    
callA(args)    
callB(args)    
}  
```  
  
or  
  
```go  
func Caller(args Args) {    
callA(args)    
}    
    
func callA(args Args) {    
callB(args)    
}    
    
func callB(args Args) {    
return    
}  
```  
  
Both of these represent a call chain where **Caller()** calls **callA()** which eventually leads to **callB()**. You can see how we can end up with a series of calls that are executed.  
  
There is nothing wrong with this design of course, but when these callers are making remote calls to other systems, those remote calls must be mocked/faked out in order to provide ==hermetic== testing.  
  
You also may want to have conditional call chains, where depending on some argument or state, you use **if/else** to call different functions under certain conditions.  
  
This means that to hermetically test **Caller()** you may need to handle fakes all the way through the entire call chain. If there are 50 stages, you may need to handle all the mock/fakes for every stage below the function you want to test.  
  
This is where Pike’s state machine design can really shine.  
  
# The state machine pattern  
  
First, we define a state:  
  
```go  
type State[T any] func(ctx context.Context, args T) (T, State[T], error)  
```  
  
This represents a function/method that receives a set of arguments as any type **T** and returns the arguments for the next state and the next **State** to run or an **error**.  
  
If the **State** returned is **nil**, then the state machine will stop running. If the **error** is set, the state machine will also stop. Because you are returning what the next **State** to run is, you have different next **State(**s) depending on various conditions.  
  
One of the differences of this version from Pike’s state machine is the inclusion of generics here and the returned **T**. This allows us to create a purely functional state machine (if desired) that can return a stack allocated type that can be passed to the next **State**. Pike did not have access to generics back when he originally wrote this design.  
  
Now to make this work we need a state runner:  
  
```go  
func Run[T any](ctx context.Context, args T, start State[T]) (T, error) {    
	var err error    
	current := start    
	for {    
		if ctx.Err() != nil {    
			return args, ctx.Err()    
		}    
		args, current, err = current(ctx, args)    
		if err != nil {    
			return args, err    
		}    
		if current == nil {    
			return args, nil    
		}    
	}    
}  
```  
  
Now we have a functional state runner in a few lines of code.  
  
Let’s look at an example where we write the state machine for service turndown operations in with a cluster:  
  
```go  
package remove    
    
...    
    
// storageClient provides the methods on a storage service    
// that must be provided to use Remove().    
type storageClient interface {    
	RemoveBackups(ctx context.Context, service string, mustKeep int) error    
	RemoveContainer(ctx context.Context, service string) error    
}    
    
// serviceClient provides methods to do operations for services    
// within a cluster.    
type servicesClient interface {    
	Drain(ctx context.Context, service string) error    
	Remove(ctx context.Context, service string) error    
	List(ctx context.Context) ([]string, error)    
	HasStorage(ctx context.Context, service string) (bool, error)    
}  
```  
  
Here we define a couple of private interfaces that we will need clients to implement in order to remove our service from cluster.  
  
We define private interfaces to prevent others from using our definitions, but we will expose them via a public variable. This keeps us loosely bound to the clients with just the methods we require.  
  
```go  
// Args are arguments to Service().    
type Args struct {    
// Name is the name of the service.    
	Name string    
    
// Storage is a client that can remove storage backups and storage    
// containers for a service.    
	Storage storageClient    
// Services is a client that allows the draining and removal of    
// a service from the cluster.    
	Services servicesClient    
}    
    
func (a Args) validate(ctx context.Context) error {    
	if a.Name == "" {    
		return fmt.Errorf("Name cannot be an empty string")    
	}    
    
	if a.Storage == nil {    
		return fmt.Errorf("Storage cannot be nil")    
	}    
	if a.Services == nil {    
		return fmt.Errorf("Services cannot be nil")    
	}    
	return nil    
}  
```  
  
This sets up the arguments we are going to pass through our states. We could include private fields that would be set in one **State** and passed into another **State**.  
  
**Notice** that **Args** _is not a pointer._  
  
Because we modify and pass the **Args** to each **State**, we do not need to burden the garbage collector. For some operation like this, it is trivial savings. In a heavy hit ETL pipeline, this could be the difference in long pauses that you don’t need.  
  
We include a **validate()** method to let us test our arguments meet the base minimum to be used.  
  
```go  
// Service removes a service from a cluster and associated storage.    
// The last 3 storage backups are retained for whatever the storage retainment    
// period is.    
func Service(ctx context.Context, args Args) error {    
	if err := args.validate(); err != nil {    
		return err    
}    
    
	start := drainService    
	_, err := Run[Args](ctx, args, start)    
	if err != nil {    
		return fmt.Errorf("problem removing service %q: %w", args.Name, err)    
	}    
	return nil    
}  
```  
  
**Service()** is what the package users will call. They simply pass in the **Args** and receive an error if something goes wrong. They don’t see the state machine pattern and don’t need to understand it in order to perform the operation.  
  
We simply validate the **Args** look correct, set the starting state of our state machine to a function called **drainService** and call the **Run()** function we defined above.  
  
```go  
func drainService(ctx context.Context, args Args) (Args, State[Args], error) {    
	l, err := args.Services.List(ctx)    
	if err != nil {    
		return args, nil, err    
	}    
    
	found := false    
	for _, entry := range l {    
		if entry == args.Name {    
			found = true    
			break    
		}    
	}    
	if !found {    
		return args, nil, fmt.Errorf("the service was not found")    
	}    
    
	if err := args.Services.Drain(ctx, args.Name); err != nil {    
		return args, nil, fmt.Errorf("problem draining the service: %w", err)    
	}    
    
	return args, removeService, nil    
}  
```  
  
Our first state is called **drainService()**. It implements the **State** type we defined above.  
  
It uses the **Services** client defined in **Args** to list all the services in a cluster. If it does not find the service, it returns an error and the state machine ends.  
  
If it find the service, it performs a service drain on the service. Once that completes we move on to the next state, **removeService().**  
  
```go  
func removeService(ctx context.Context, args Args) (Args, State[Args], error) {    
	if err := args.Services.Remove(ctx, args.Name); err != nil {    
		return args, nil, fmt.Errorf("could not remove the service: %w", err)    
	}    
    
	hasStorage, err := args.Services.HasStorage(ctx, args.Name)    
	if err != nil {    
		return args, nil, fmt.Errorf("HasStorage() failed: %w", err)    
	}    
	if hasStorage{    
		return args, removeBackups, nil    
	}    
	    
	return args, nil, nil    
}  
```  
  
**removeService()** uses our **Services** client to remove the service from running in the cluster.  
  
Once that complete, is determines if we have storage by calling the **HasStorage()** method. If we have storage, we move on to the **removeBackups()** **State**, otherwise we return **args, nil, nil** which causes the state machine to exit with no errors.  
  
This is an example of how you can branch in your state machine based on either information in **Args** or remote calls that your code makes.  
  
The other **State** calls are up to you to determine. Let’s look at how this design is better suited for testing this type of action.  
  
# Testing Advantages  
  
The first thing this pattern can encourage is small blocks of testable code. It makes things easily divisible so that when a block gets too big, you simply create a new **State** that isolates the block.  
  
But the bigger advantage is removing the need for a large end to end test. Because each stage in an operational flow needs to call the next stage, you end up in one of the following scenarios:  
  
- The top-level caller calls all the sub functions in some order  
- Each caller calls the next function  
- Some mixture of the two  
  
Both lead to some type of end to end test that shouldn’t be needed.  
  
If we coded the top level caller method, it might look like this:  
  
```go  
func Service(ctx context.Context, args Args) error {    
...    
	if err := drainService(ctx, args); err != nil {    
		return err    
	}    
    
	if err := removeService(ctx, args); err != nil {    
		return err    
	}    
    
	hasStorage, err := args.Services.HasStorage(ctx, args.Name)    
	if err != nil {    
		return err    
	}    
    
	if hasStorage{    
		if err := removeBackups(ctx, args); err != nil {    
			return err    
		}    
		if err := removeStorage(ctx, args); err != nil {    
			return err    
		}    
	}    
	return nil    
}  
```  
  
As you can see, you can write individual tests for all your sub-functions, but to test **Service()**, now you have to fake either all the clients for each call or other unsavory methods. That starts to look like end to end tests, and for this type of code it is usually a bad idea.  
  
If we move to a functional call chain, the situation doesn’t get much better:  
  
```go  
func Service(ctx context.Context, args Args) error {    
...    
	return drainService(ctx, args)    
}    
    
func drainService(ctx context.Context, args Args) (Args, error) {    
...    
	return removeService(ctx, args)    
}    
    
func removeService(ctx context.Context, args Args) (Args, error) {    
...    
	hasStorage, err := args.Services.HasStorage(ctx, args.Name)    
	if err != nil {    
		return args, fmt.Errorf("HasStorage() failed: %w", err)    
	}    
	    
	if hasStorage{    
		return removeBackups(ctx, args)    
	}    
	    
	return nil    
}    
...  
```  
  
Now when we test, the tests get more difficult to implement as we get closer to the top of the call chain. At **Service()** we have to test **drainService(), removeService()** and every call below it.  
  
There are several ways to do this, but none are fun.  
  
With the state machine version, we can simply test that each individual stage does what we want and returns the next stage we want.  
  
The top level caller doesn’t even need to be tested. It calls a **validate()** method we can write a test for and calls a **Run()** function we should have tests for.  
  
Let’s write a table-driven test for **drainService().** I will include the **drainService()** code to minimize having to scroll.  
  
```go  
func drainService(ctx context.Context, args Args) (Args, State[Args], error) {    
	l, err := args.Services.List(ctx)    
	if err != nil {    
		return args, nil, err    
	}    
	    
	found := false    
	for _, entry := range l {    
		if entry == args.Name {    
			found = true    
			break    
		}    
	}    
	if !found {    
		return args, nil, fmt.Errorf("the service was not found")    
	}    
	    
	if err := args.Services.Drain(ctx, args.Name); err != nil {    
		return args, nil, fmt.Errorf("problem draining the service: %w", err)    
	}    
	    
	return args, removeService, nil    
}    
    
func TestDrainSerivce(t *testing.T) {    
	t.Parallel()    
	    
	tests := []struct {    
		name string    
		args Args    
		wantErr bool    
		wantState State[Args]    
	}{    
	{    
		name: "Error: Services.List() returns an error",    
		args: Args{    
		Services: &fakeServices{    
			list: fmt.Errorf("error"),    
			},    
		},    
		wantErr: true,    
	},    
	{    
		name: "Error: Services.List() didn't contain our service name",    
		args: Args{    
			Name: "myService",    
			Services: &fakeServices{    
				list: []string{"nope", "this", "isn't", "it"},    
			},    
		},    
		wantErr: true,    
	},    
	{    
		name: "Error: Services.Drain() returned an error",    
		args: Args{    
			Name: "myService",    
			Services: &fakeServices{    
				list: []string{"yes", "mySerivce", "is", "here"},    
				drain: fmt.Errorf("error"),    
			},    
		},    
		wantErr: true,    
	},    
	{    
		name: "Success",    
		args: Args{    
			Name: "myService",    
			Services: &fakeServices{    
				list: []string{"yes", "myService", "is", "here"},    
				drain: nil,    
				},    
			},    
			wantState: removeService,    
		},    
	}    
	    
	for _, test := range tests {    
		_, nextState, err := drainService(context.Background(), test.args)    
		switch {    
			case err == nil && test.wantErr:    
				t.Errorf("TestDrainService(%s): got err == nil, want err != nil", test.name)    
				continue    
			case err != nil && !test.wantErr:    
				t.Errorf("TestDrainService(%s): got err == %s, want err == nil", test.name, err)    
				continue    
			case err != nil:    
				continue    
			}    
			    
			gotState := methodName(nextState)    
			wantState := methodName(test.wantState)    
			if gotState != wantState {    
				t.Errorf("TestDrainService(%s): got next state %s, want %s", test.name, gotState, wantState)    
			}    
		}    
}  
```  
  
You can play with this on the Go playground [here](https://go.dev/play/p/HcgYkQOjeIz).  
  
As you can see we avoid any need to test an entire call chain while still ensuring that the next function in the chain will be called when we want it to.  
  
The tests are easily divisible and are easy for a maintainer to follow.  
  
# Other Possibilities  
  
There are variations on this pattern where the **State** is determined from a field set in **Args** and you can track **State** execution to prevent loops.  
  
In the first case, the state machine package might look like:  
  
```go  
type State[T any] func(ctx context.Context, args T) (T, State[T], error)    
    
type Args[T] struct {    
	Data T    
	    
	Next State    
}    
    
    
func Run[T any](ctx context.Context, args Args[T], start State[T]) (T, error) {    
	var err error    
	current := start    
	for {    
		if ctx.Err() != nil {    
			return args, ctx.Err()    
		}    
		args, current, err = current(ctx, args)    
		if err != nil {    
			return args, err    
		}    
		current = args.Next // Set our next stage    
		args.Next = nil // Clear this so to prevent infinite loops    
		    
		if current == nil {    
			return args, nil    
		}    
	}    
}  
```  
  
And you can easily do things like integrate distributing tracing or logging into this design.  
  
If you are looking to push a lot of data and take advantage of concurrency AND parallelism, you might give the [stagedpipe package](https://github.com/gostdlib/concurrency/tree/main/pipelines/stagedpipe) a try. It is based on this structure with a ton of advanced features built in. There are videos and a README to introduce you to using the package.  
  
Hopefully this article has given you a good understanding of the Go state machine design pattern. You now have powerful new tool in your toolbelt.