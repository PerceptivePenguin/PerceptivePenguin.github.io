---  
blog: _posts  
share: true  
tags:  
  - windows_server  
---  
1. [OpenSSH 配置文件](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_server_configuration#openssh-configuration-files)  
2. [为 Windows 中的 OpenSSH 配置默认 shell](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_server_configuration#configuring-the-default-shell-for-openssh-in-windows)  
3. [Sshd_config 中的 Windows 配置](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_server_configuration#windows-configurations-in-sshd_config)  
  
> 适用于 Windows Server 2022、Windows Server 2019、Windows 10（内部版本 1809 及更高版本）  
  
本文介绍了适用于 OpenSSH 服务器 (sshd) 的特定于 Windows 的配置。  
  
OpenSSH 在 [OpenSSH.com](https://www.openssh.com/manual.html) 上在线维护有关配置选项的详细文档，本文档集中没有重述。  
  
[](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_server_configuration#openssh-configuration-files)  
  
## OpenSSH 配置文件  
  
OpenSSH 具有用于服务器和客户端设置的配置文件。 OpenSSH 是开源软件，从 Windows Server 2019 和 Windows 10（内部版本 1809）开始添加到 Windows Server 和 Windows 客户端操作系统中。 因此，这里不再赘述 OpenSSH 配置文件的开源文档。 客户端配置文件可以在 [ssh_config 手册页](https://man.openbsd.org/ssh_config)中找到，而 OpenSSH 服务器配置文件可以在 [sshd_config 手册页](https://man.openbsd.org/sshd_config)中找到。  
  
Open SSH 服务器 (sshd) 默认情况下从 %programdata%\ssh\sshd_config 中读取配置数据，也可以通过使用 `-f` 参数启动 `sshd.exe` 来指定不同的配置文件。 如果该文件不存在，则在启动该服务时，sshd 将使用默认配置生成一个文件。  
  
在 Windows 中，OpenSSH 客户端 (ssh) 按以下顺序从配置文件中读取配置数据：  
  
1. 通过使用 -F 参数启动 ssh.exe，指定配置文件的路径和该文件中的条目名称。  
2. 位于 %userprofile%\.ssh\config 的用户配置文件。  
3. 位于 %programdata%\ssh\ssh_config 的系统范围配置文件。  
## 为 Windows 中的 OpenSSH 配置默认 shell  
  
默认命令 shell 提供用户使用 SSH 连接到服务器时看到的体验。 初始默认 Windows 是 Windows Command shell (cmd.exe)。 Windows 还包括了 PowerShell，第三方命令 shell 也可用于 Windows，并可配置为服务器的默认 shell。  
  
若要设置默认命令 shell，请首先确认 OpenSSH 安装文件夹是否位于系统路径上。 对于 Windows，默认安装文件夹为 %systemdrive%\Windows\System32\openssh。 以下命令显示当前路径设置，并向其中添加默认的 OpenSSH 安装文件夹。  
  
|命令 shell|要使用的命令|  
|---|---|  
|命令|`path`|  
|PowerShell|`$env:path`|  
  
通过将 shell 可执行文件的完整路径添加到 `DefaultShell` 字符串值中的 `HKEY_LOCAL_MACHINE\SOFTWARE\OpenSSH`，在 Windows 注册表中配置默认 ssh shell。  
  
例如，以下提升的 PowerShell 命令将默认 shell 设置为 powershell.exe：  
  
```powershell  
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force  
```  
  
## Sshd_config 中的 Windows 配置  
  
在 Windows 中，sshd 默认情况下从 %programdata%\ssh\sshd_config 中读取配置数据，也可以通过使用 `-f` 参数启动 `sshd.exe` 来指定不同的配置文件。 如果该文件不存在，则在启动该服务时，sshd 将使用默认配置生成一个文件。  
  
下面列出的元素提供了通过 sshd_config 中的条目可以实现的特定于 Windows 的配置。 可以在其中实现的其他一些配置设置在此处没有列出，因为在线 [Win32 OpenSSH 文档](https://github.com/powershell/win32-openssh/wiki)中详细介绍了它们。  
  
> OpenSSH 服务器 (sshd) 在服务启动后读取配置文件。 对配置文件的任何更改都需要重新启动服务。  
  
### AllowGroups、AllowUsers、DenyGroups、DenyUsers  
  
使用 AllowGroups、AllowUsers、DenyGroups 和 DenyUsers 指令控制哪些用户和组可以连接到服务器。 allow/deny 指令按以下顺序处理：DenyUsers、AllowUsers、DenyGroups，最后是 AllowGroups。 必须以小写形式指定所有帐户名称。 有关 SSH_ 配置中的模式和通配符的更多信息，请参阅 [sshd_config OpenBSD 手册页](https://man.openbsd.org/ssh_config#PATTERNS)。  
  
当使用域用户或组配置基于用户/组的规则时，请使用以下格式：`user?domain*`。 Windows 允许使用多种格式来指定域主体，但许多格式与标准 Linux 模式冲突。 因此，添加了 * 来涵盖 FQDN。 此外，此方法使用“?”而不是 @，以避免与“用户名@主机”格式发生冲突。  
  
工作组用户/组和连接到 internet 的帐户始终解析为其本地帐户名称（不包括域部分，类似于标准 Unix 名称）。 域用户和组严格解析为 [NameSamCompatible](https://learn.microsoft.com/zh-cn/windows/desktop/api/secext/ne-secext-extended_name_format) 格式 - domain_short_name\user_name。 所有基于用户/组的配置规则都需要遵循此格式。  
  
以下示例拒绝来自主机 192.168.2.23 的 contoso\admin，并阻止来自 contoso 域的所有用户。 以下示例还允许属于 contoso\sshusers 组和 contoso\serveroperators 组成员的用户。  
  
```  
DenyUsers contoso\admin@192.168.2.23  
DenyUsers contoso\*  
AllowGroups contoso\sshusers contoso\serveroperators  
```  
  
以下示例允许用户 localusers 从主机 192.168.2.23 登录，并允许 sshusers 组成员登录。  
  
sshd_config复制  
  
```  
AllowUsers localuser@192.168.2.23  
AllowGroups sshusers  
```  
  
### AuthenticationMethods  
  
对于 Windows OpenSSH，唯一可用的身份验证方法是 `password` 和 `publickey`。  
  
> 当前不支持使用 Microsoft Entra 帐户进行身份验证。  
  
### AuthorizedKeysFile  
  
默认为 `.ssh/authorized_keys`。 如果路径不是绝对路径，则采用相对于用户的主目录的路径（或配置文件映像路径），例如，C:\Users\username。 如果用户属于管理员组，则改为使用 %programdata%/ssh/administrators_authorized_keys。  
  
> administrators_authorized_keys 文件必须只具有 NT Authority\SYSTEM 帐户和 BUILTIN\Administrators 安全组的权限条目。 NT Authority\SYSTEM 帐户必须被授予完全控制权限。 管理员需要 BUILTIN\Administrators 安全组来管理授权密钥，你可以选择所需的访问权限。 要授予权限，你可以打开提升的 PowerShell 提示符，然后运行 `icacls.exe "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"` 命令。  
  
### ChrootDirectory（在 v7.7.0.0 中添加的支持）  
  
此指令仅在 sftp 会话中受支持。 到 cmd.exe 的远程会话不遵循 `ChrootDirectory`。 若要设置仅限 sftp 的 chroot 服务器，请将 ForceCommand 设置为 internal-sftp。 还可以通过实现仅允许 scp 和 sftp 的自定义 shell，来通过 chroot 设置 scp。  
  
### GSSAPIAuthentication  
  
`GSSAPIAuthentication` 配置参数指定是否允许基于 GSSAPI 的用户身份验证。 `GSSAPIAuthentication` 的默认值为 no。  
  
使用 OpenSSH 客户端时，GSSAPI 身份验证还需要使用 `-K` 开关以指定主机名。 或者，你可以在 SSH 客户端配置中创建相应的条目。 在 Windows 中，OpenSSH 客户端默认从 %userprofile%.ssh\config 读取配置数据。  
  
你可以在下面看到一个 GSSAPI OpenSSH 客户端配置示例。  
  
config复制  
  
```  
# Specify a set of configuration arguments for a host matching the pattern SERVER01.contoso.com  
# Patterns are case sensitive  
Host SERVER01.contoso.com  
    # Enables GSSAPI authentication  
    GSSAPIAuthentication yes  
    # Forward (delegate) credentials to the server.  
    GSSAPIDelegateCredentials yes  
```  
  
> GSSAPI 仅在 Windows Server 2022、Windows 11 和 Windows 10 xxxx 中可用。  
  
### HostKey  
  
默认值为：  
  
sshd_config复制  
  
```  
#HostKey __PROGRAMDATA__/ssh/ssh_host_rsa_key  
#HostKey __PROGRAMDATA__/ssh/ssh_host_dsa_key  
#HostKey __PROGRAMDATA__/ssh/ssh_host_ecdsa_key  
#HostKey __PROGRAMDATA__/ssh/ssh_host_ed25519_key  
```  
  
如果默认值不存在，则 sshd 会在服务启动时自动生成这些值。  
### 匹配  
  
将使用一个或多个标准来匹配条件。 找到一个匹配项后，将应用后续的配置参数。 匹配时使用 [AllowGroups、AllowUsers、DenyGroups、DenyUsers](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_server_configuration#allowgroups-allowusers-denygroups-denyusers) 部分中介绍的模式规则。 用户和组名称应采用小写。  
### PermitRootLogin  
  
在 Windows 中不适用。 要阻止管理员登录，请将 Administrators 与 DenyGroups 指令一起使用。  
### SyslogFacility  
  
如果需要基于文件的日志记录，请使用 LOCAL0。 日志将在 %programdata%\ssh\logs 下生成。 对于其他任何值（包括默认值）AUTH 都会将日志记录定向到 ETW。 有关详细信息，请参阅 [Windows 中的日志记录功能](https://github.com/PowerShell/Win32-OpenSSH/wiki/Logging-Facilities)。  
### 配置参数  
  
以下配置参数从 Windows Server 2022、Windows 11 和 Windows 10 xxxx 开始可用：  
  
- GSSAPIAuthentication  
  
以下配置参数在 Windows 服务器和 Windows 客户端附带的 OpenSSH 版本中不可用：  
  
- AcceptEnv  
- AllowStreamLocalForwarding  
- AuthorizedKeysCommand  
- AuthorizedKeysCommandUser  
- AuthorizedPrincipalsCommand  
- AuthorizedPrincipalsCommandUser  
- 压缩  
- ExposeAuthInfo  
- GSSAPICleanupCredentials  
- GSSAPIStrictAcceptorCheck  
- HostbasedAcceptedKeyTypes  
- HostbasedAuthentication  
- HostbasedUsesNameFromPacketOnly  
- IgnoreRhosts  
- IgnoreUserKnownHosts  
- KbdInteractiveAuthentication  
- KerberosAuthentication  
- KerberosGetAFSToken  
- KerberosOrLocalPasswd  
- KerberosTicketCleanup  
- PermitTunnel  
- PermitUserEnvironment  
- PermitUserRC  
- PidFile  
- PrintLastLog  
- PrintMotd  
- RDomain  
- StreamLocalBindMask  
- StreamLocalBindUnlink  
- StrictModes  
- X11DisplayOffset  
- X11Forwarding  
- X11UseLocalhost  
- XAuthLocation