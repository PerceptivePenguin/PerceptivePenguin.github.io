---  
blog: _posts  
share: true  
tags:  
  - windows_server  
---  
1. [关于密钥对](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_keymanagement#about-key-pairs)  
2. [主机密钥生成](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_keymanagement#host-key-generation)  
3. [用户密钥生成](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_keymanagement#user-key-generation)  
4. [部署公钥](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_keymanagement#deploying-the-public-key)  
  
> 适用于 Windows Server 2022、Windows Server 2019、Windows 10（内部版本 1809 及更高版本）  
  
Windows 环境中的大多数身份验证都是使用用户名-密码对完成的，这非常适用于共享公共域的系统。 跨域工作时（例如在本地和云托管的系统之间），很容易受到暴力攻击入侵。  
  
相比之下，Linux 环境通常使用公钥/私钥对来驱动身份验证，这不要求使用可推测的密码。 OpenSSH 包含有助于支持基于密钥的身份验证的工具，具体来说：  
  
- **ssh-keygen**，用于生成安全的密钥  
- **ssh-agent** 和 **ssh-add**，用于安全地存储私钥  
- **scp** 和 **sftp**，在首次使用服务器时安全地复制公钥文件  
  
本文档概述了如何在 Windows 上使用这些工具开始使用 SSH 进行基于密钥的身份验证。 如果你不熟悉 SSH 密钥管理，我们强烈建议你查看 [NIST 文档 IR 7966](http://nvlpubs.nist.gov/nistpubs/ir/2015/NIST.IR.7966.pdf)，标题为“使用安全外壳 (SSH) 的交互和自动化访问管理的安全性”。  
  
## 关于密钥对  
  
密钥对指的是由特定的身份验证协议使用的公钥和私钥文件。  
  
SSH 公钥身份验证使用不对称加密算法来生成两个密钥文件 – 一个为“私钥”文件，一个为“公钥”文件。 私钥文件等效于密码，在所有情况下都应当保护它们。 如果有人获取了你的私钥，则他们可以像你一样登录到你有权登录的任何 SSH 服务器。 公钥放置在 SSH 服务器上，并且可以共享，不会危害私钥的安全。  
  
基于密钥的身份验证使 SSH 服务器和客户端能够将提供的用户名的公钥与私钥进行比较。 如果无法依据客户端私钥验证服务器端公钥，则身份验证失败。  
  
可以通过密钥对实现多重身份验证，方法是在生成密钥对时输入密码（参阅下面的[用户密钥生成](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_keymanagement#user-key-generation)）。 身份验证期间，系统将提示用户输入通行短语。 通行短语与 SSH 客户端上的私钥一起用于对用户进行身份验证。  
  
> 通过基于密钥的身份验证打开的远程会话没有关联的用户凭据，因此无法作为用户进行出站身份验证，这是设计所致。  
  
## 主机密钥生成  
  
公钥具有特定的 ACL 要求，在 Windows 上，这些要求等同于仅允许管理员和 System 进行访问。 首次使用 sshd 时，将自动生成主机的密钥对。  
  
>  首先需要安装 OpenSSH 服务器。 请参阅 [OpenSSH 入门](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_install_firstuse)。  
  
默认情况下，sshd 服务设置为手动启动。 若要在每次重新启动服务器时启动它，请从服务器上提升的 PowerShell 提示符运行以下命令：  
  
```powershell  
# Set the sshd service to be started automatically  
Get-Service -Name sshd | Set-Service -StartupType Automatic  
  
# Now start the sshd service  
Start-Service sshd  
```  
  
由于没有与 sshd 服务关联的用户，因此主机密钥存储在 C:\ProgramData\ssh 下。  
  
## 用户密钥生成  
  
若要使用基于密钥的身份验证，首先需要为客户端生成公钥/私钥对。 ssh-keygen.exe 用于生成密钥文件，可以指定 DSA、RSA、ECDSA 或 Ed25519 算法。 如果未指定算法，则使用 RSA。 应使用强算法和密钥长度，例如此示例中的 Ed25519。  
  
要使用 Ed25519 算法生成密钥文件，请从客户端上的 PowerShell 或 cmd 提示符运行以下命令：  
  
```powershell  
ssh-keygen -t ed25519  
```  
  
命令的输出应显示以下输出（其中“username”替换为你的用户名）：  
  
```  
Generating public/private ed25519 key pair.  
Enter file in which to save the key (C:\Users\username/.ssh/id_ed25519):  
```  
  
你可以按 Enter 来接受默认值，或指定要在其中生成密钥的路径和/或文件名。 此时，系统会提示你使用密码来加密你的私钥文件。 通行短语可以为空，但不建议这样做。 将密码与密钥文件一起使用来提供双因素身份验证。 在此示例中，我们将通行短语留空。  
  
```  
Enter passphrase (empty for no passphrase):  
Enter same passphrase again:  
Your identification has been saved in C:\Users\username/.ssh/id_ed25519.  
Your public key has been saved in C:\Users\username/.ssh/id_ed25519.pub.  
The key fingerprint is:  
SHA256:OIzc1yE7joL2Bzy8!gS0j8eGK7bYaH1FmF3sDuMeSj8 username@LOCAL-HOSTNAME  
  
The key's randomart image is:  
+--[ED25519 256]--+  
|        .        |  
|         o       |  
|    . + + .      |  
|   o B * = .     |  
|   o= B S .      |  
|   .=B O o       |  
|  + =+% o        |  
| *oo.O.E         |  
|+.o+=o. .        |  
+----[SHA256]-----+  
```  
  
现在，你在指定的位置有了一个公/私 ed25519 密钥对。 .pub 文件是公钥，没有扩展名的文件是私钥：  
  
```  
Mode                LastWriteTime         Length Name  
----                -------------         ------ ----  
-a----         6/3/2021   2:55 PM            464 id_ed25519  
-a----         6/3/2021   2:55 PM            103 id_ed25519.pub  
```  
  
请记住，私钥文件等效于密码，应当采用与保护密码相同的方式来保护它。 使用 ssh-agent 来将私钥安全地存储在与你的 Windows 帐户关联的 Windows 安全上下文中。 要在每次重启计算机时启动 ssh-agent 服务，并使用 ssh-add 存储私钥，请通过服务器上提升的 PowerShell 提示符运行以下命令：  
  
```powershell  
# By default the ssh-agent service is disabled. Configure it to start automatically.  
# Make sure you're running as an Administrator.  
Get-Service ssh-agent | Set-Service -StartupType Automatic  
  
# Start the service  
Start-Service ssh-agent  
  
# This should return a status of Running  
Get-Service ssh-agent  
  
# Now load your key files into ssh-agent  
ssh-add $env:USERPROFILE\.ssh\id_ed25519  
```  
  
将密钥添加到客户端上的 ssh-agent 后，ssh-agent 会自动检索本地私钥并将其传递给 SSH 客户端。  
  
> 强烈建议你将私钥备份到一个安全位置，将其添加到 ssh-agent，然后将其从本地系统中删除。 如果使用了强算法（例如此示例中的 Ed25519），则无法从代理中检索私钥。 如果你失去了对私钥的访问权限，则必须在你与之交互的所有系统上创建一个新的密钥对并更新公钥。  
  
## 部署公钥  
  
要使用上面创建的用户密钥，必须将公钥 (_\.ssh\id_ed25519.pub_) 的内容作为文本文件放在服务器上。 文件的名称和位置取决于用户帐户是本地管理员组的成员还是标准用户帐户。 以下部分涵盖标准和管理用户。  
  
### 标准用户  
  
公钥 (_\.ssh\id_ed25519.pub_) 的内容需放置在服务器上的一个名为 `authorized_keys` 的文本文件中，该文件位于 _C:\Users\username\.ssh\_。 可以使用 OpenSSH scp 安全文件传输实用工具或使用 PowerShell 将密钥写入文件来复制公钥。  
  
以下示例将公钥复制到服务器（其中“username”替换为你的用户名）。 最初，你需要使用服务器的用户帐户的密码。  
  
```powershell  
# Get the public key file generated previously on your client  
$authorizedKey = Get-Content -Path $env:USERPROFILE\.ssh\id_ed25519.pub  
  
# Generate the PowerShell to be run remote that will copy the public key file generated previously on your client to the authorized_keys file on your server  
$remotePowershell = "powershell New-Item -Force -ItemType Directory -Path $env:USERPROFILE\.ssh; Add-Content -Force -Path $env:USERPROFILE\.ssh\authorized_keys -Value '$authorizedKey'"  
  
# Connect to your server and run the PowerShell using the $remotePowerShell variable  
ssh username@domain1@contoso.com $remotePowershell  
```  
  
### 管理用户  
  
公钥 (_\.ssh\id_ed25519.pub_) 的内容需放置在服务器上的一个名为 `administrators_authorized_keys` 的文本文件中，该文件位于 _C:\ProgramData\ssh\_。 可以使用 OpenSSH scp 安全文件传输实用工具或使用 PowerShell 将密钥写入文件来复制公钥。 此文件上的 ACL 需要配置为仅允许访问管理员和系统。  
  
以下示例将公钥复制到服务器并配置 ACL（其中“username”替换为你的用户名）。 最初，你需要使用服务器的用户帐户的密码。  
  
> 此示例演示了创建 `administrators_authorized_keys` 文件的步骤。 它仅适用于管理员帐户且必须进行使用，而不是用户配置文件位置中的每用户文件。  
  
```powershell  
# Get the public key file generated previously on your client  
$authorizedKey = Get-Content -Path $env:USERPROFILE\.ssh\id_ed25519.pub  
  
# Generate the PowerShell to be run remote that will copy the public key file generated previously on your client to the authorized_keys file on your server  
$remotePowershell = "powershell Add-Content -Force -Path $env:ProgramData\ssh\administrators_authorized_keys -Value '''$authorizedKey''';icacls.exe ""$env:ProgramData\ssh\administrators_authorized_keys"" /inheritance:r /grant ""Administrators:F"" /grant ""SYSTEM:F"""  
  
# Connect to your server and run the PowerShell using the $remotePowerShell variable  
ssh username@domain1@contoso.com $remotePowershell  
```  
  
对于非英语本地化版本的操作系统，需修改该脚本以相应地反映组名称。 若要防止在授予组名称权限时出现错误，可适当使用安全标识符 (SID)。 可通过运行 `Get-LocalGroup | Select-Object Name, SID` 来检索 SID。 使用 SID 代替组名称时，它前面必须带有星号 (*****)。 在以下示例中，**Administrators** 组使用 SID `S-1-5-32-544`：  
  
```powershell  
$remotePowershell = "powershell Add-Content -Force -Path $env:ProgramData\ssh\administrators_authorized_keys -Value '''$authorizedKey''';icacls.exe ""$env:ProgramData\ssh\administrators_authorized_keys"" /inheritance:r /grant ""*S-1-5-32-544:F"" /grant ""SYSTEM:F"""  
```  
  
这些步骤完成了对 Windows 上的 OpenSSH 使用基于密钥的身份验证所需的配置。 运行示例 PowerShell 命令后，用户可以从具有私钥的任何客户端连接到 sshd 主机。