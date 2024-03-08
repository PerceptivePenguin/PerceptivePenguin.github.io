---  
blog: _posts  
share: true  
tags:  
  - Clash  
---  
  
本次介绍利用Clash for Windows（以下简称CFW）和Clash .Net（以下简称CDN）两个软件中的mixin功能实现TUN/TAP虚拟网卡接管流量  
  
截至本文完成，CFW的最新版本是0.15.5，CDN的最新版本是1.0.3  
  
本次示例以便携版为示例，两种软件的便携化方法都是下载压缩包，在解压出来的文件夹中新建data文件夹，配置文件等都会保存在其中，更新只需要移动data文件夹  
  
### 1、TUN/TAP非常浅显的一点说明  
  
#### (1)什么是TUN/TAP  
  
TUN是clash的premium核心专属功能，可以使用虚拟网卡接管流量  
  
而TAP是CFW的功能，并非clash核心功能，同样可以使用虚拟网卡接管流量  
  
#### (2)TUN/TAP有什么用  
  
暂且不讨论对全局代理的理解（不知道我什么意思就当我没说好了）  
  
本次介绍的两个客户端（CFW和CDN）都有系统代理的功能  
  
但是系统代理并不能解决所有程序的代理问题  
  
举例来说，当使用uwp应用的时候，默认是无法指定本地代理的；玩游戏的时候，是不经过代理的  
  
传统方法是，对于uwp应用使用enableloopback，对于游戏使用Netch，还有人使用proxifier等  
  
但我们可以使用TUN/TAP来建立虚拟网卡接管程序流量来达到强制代理的目的  
  
也就是说，clash只要配置好，同样能完成别的软件可以完成的事  
  
#### (3)一些杂谈  
  
其实本次介绍的客户端中，CDN另有[增强模式](https://docs.clashdotnet.cf/zeng-qiang-mo-shi)，使用增强模式同样能做到强制代理（效果与Netch的进程代理差不多）  
  
### 2、什么是Mixin  
  
Mixin，你可以理解为**临时**覆写，或者可以理解为**临时**混合配置文件  
  
Mixin的实质是在Clash核心读取完配置文件后对其进行**临时**修改而不对本地的原配置文件进行改动  
  
利用这个特性，我们可以轻松实现TUN/TAP的临时开关（鉴于这两款软件并未原始提供默认的TUN/TAP配置和相应开关的选项）  
  
### 3、CDN开启TUN的方法  
  
#### (1)准备工作  
  
目前TUN是Clash的Premium版核心专有功能，开源版核心并没有实现TUN  
  
CFW使用的是Premium核心，因此我们可以正常使用TUN  
  
而CDN默认使用的是开源版核心，因此为了使用TUN我们应该更换核心为Premium版  
  
我们先去Clash源仓库下载Premium核心（[点此](https://github.com/Dreamacro/clash/releases/tag/premium)）,向下翻找下载amd64（就是x64，如果你是x86或是说32位那就去下386）  
  
![](https://telegra.ph/file/79d3ee304d25493bd0a22.png)  
  
以x64为例，我们下载到的文件解压后是这个（上图）  
  
CDN的核心文件存在于CDN目录下的/bin子文件夹，文件名是Clash.exe（下图）  
  
![](https://telegra.ph/file/cae88f594104c3a0956c2.png)  
  
因此我们将原核心文件重命名为Clash.exebackup下载到的文件复制到该目录，并重命名为Clash.exe（以防下错核心从头再来）  
  
![](https://telegra.ph/file/cb8fccaaed73dd76473e8.png)  
  
然后我们去https://www.wintun.net下载wintun.dll  
  
![](https://telegra.ph/file/1aae7b19344abbd419aa6.png)  
  
由于我们是64位系统，所以打开压缩包里找wintun/bin/amd64下的wintun.dll，x86请使用x86文件夹下的wintun.dll  
  
![](https://telegra.ph/file/34c459edae798293ac30d.png)  
  
然后我们在CDN目录建立一个data文件夹，打开CDN，过一会关闭CDN（生成目录）  
  
然后将我们的wintun.dll复制到/data/clash中  
  
![](https://telegra.ph/file/c4feed9946a423de6d03b.png)  
  
    
  
之后我们退回到Clash.Net目录，右键Clash.Net是用管理员身份运行  
  
![](https://telegra.ph/file/e0bcab43c8f2759c5a1aa.png)  
  
UAC提示允许就完事了~  
  
如果讨厌每次打开都要点右键，可以右键点属性，在兼容性选项中勾选使用管理员身份运行  
  
![](https://telegra.ph/file/f4a811cea9f18fb3d924e.png)  
  
打开后在CDN的界面的settings/config选项卡中点击编辑Mixin Content  
  
![](https://telegra.ph/file/785a7a5c1a21494801d3e.png)  
  
然后在弹出的编辑器中粘贴如下内容**（请注意，复制的时候会多出空行，这是Telegraph的原因，请自行删除空行）**：  
  
mixin:  
  
   dns:  
  
       enable: true  
  
       default-nameserver:  
  
         - 223.5.5.5  
  
         - 1.1.1.1  
  
       enhanced-mode: redir-host  
  
       nameserver:  
  
         - 223.5.5.5  
  
         - 223.6.6.6  
  
         - https://223.5.5.5/resolve  
  
       fallback:  
  
         - 1.1.1.1  
  
         - 208.67.220.222:5353  
  
         - https://dns.rubyfish.cn/dns-query  
  
         - https://doh.opendns.com/dns-query  
  
         - tls://1.1.1.1:853  
  
       fallback-filter:  
  
         geoip: true  
  
   tun:  
  
       enable: true  
  
       stack: gvisor  
  
       dns-hijack:  
  
         - 198.18.0.2:53  
  
       macOS-auto-route: true  
  
       macOS-auto-detect-interface: true  
  
并保存（当然你如果明白参数的意思的话可以自己编辑mixin的内容，注意缩进）  
  
**在进行接下来的操作之前请务必保证你已经完成之前的准备工作**  
  
#### (2)开启Mixin  
  
**在进行接下来的操作之前请务必保证你已经完成之前的准备工作**  
  
打开Mixin（选项左侧）  
  
切换一下配置文件（切换到另一个再切换回去）  
  
注意：如果你在这一步出现了什么error occurred的错误提示，一般情况下是你wintun.dll没有放置正确，要么是你核心没换正确  
  
稍微说明一下原因：这是因为clash核心读取的是之前的配置文件，而CDN操作临时文件后clash并未读取更改后的临时文件而是使用更改前的内容，切一下再切回去能解决（进一步的问题别问我了www）  
  
![](https://telegra.ph/file/0fd44804cf2b351eafee5.png)  
  
注意右下角的网络部分，可以发现Clash网卡已经接管了网络  
  
当我们不想使用TUN的时候，先在设置中关闭Mixin，再切换一下配置文件（切换到另一个再切换回去），然后就完成了，TUN已经关闭  
  
    
  
注意：如果你的Clash网卡显示无法连接网络，请换掉一些mixin中的DNS（nameserver和fallback）**（请注意，复制的时候会多出空行，这是Telegraph的原因，请自行删除空行）**  
  
或者你可以删掉fallback部分  
  
如下  
  
mixin:  
  
   dns:  
  
       enable: true  
  
       default-nameserver:  
  
         - 223.5.5.5  
  
         - 1.1.1.1  
  
       enhanced-mode: redir-host  
  
       nameserver:  
  
         - 223.5.5.5  
  
         - 223.6.6.6  
  
         - [https://223.5.5.5/resolve](https://223.5.5.5/resolve)  
  
   tun:  
  
       enable: true  
  
       stack: gvisor  
  
       dns-hijack:  
  
         - 198.18.0.2:53  
  
       macOS-auto-route: true  
  
       macOS-auto-detect-interface: true  
  
### 4、CFW使用Mixin开启TUN/TAP  
  
CFW的操作方式相对简单一些  
  
#### (1)准备工作  
  
①在Clash配置文件根目录处存在wintun.dll  
  
![](https://telegra.ph/file/2c8e7a216870c97cd1894.png)  
  
![](https://telegra.ph/file/d2ee0675650da495cb488.png)  
  
注：此处那么多文件夹并非默认内置  
  
②已经安装服务模式或是使用管理员模式启动  
  
服务模式在通用选项卡中安装  
  
![](https://telegra.ph/file/97fc8093a0268a96d3f11.png)  
  
![](https://telegra.ph/file/0cdb584564dfcc0fd014b.png)  
  
安装成功后CFW会自动重新启动  
  
而同时Clash根目录中会出现service子目录（如图）  
  
![](https://telegra.ph/file/1a86efd86612e1b01a005.png)  
  
同时提示用的图标会变**绿**（大雾），表示服务模式已经启动（如图）  
  
![](https://telegra.ph/file/510ffe1c11619208eab38.png)  
  
当然你同样可以用和之前CDN同样的方法，设置默认使用管理员启动  
  
![](https://telegra.ph/file/7fd4d1fe6c909bac9ca88.png)  
  
    
  
然后再切换到settings选项卡，翻到Profile Mixin部分，点击YAML的Edit  
  
![](https://telegra.ph/file/681d283ea825beccc1b58.png)  
  
粘贴内容示例**（请注意，复制的时候会多出空行，这是Telegraph的原因，请自行删除空行）**：  
  
mixin:  
  
   dns:  
  
       enable: true  
  
       default-nameserver:  
  
         - 223.5.5.5  
  
         - 1.1.1.1  
  
       enhanced-mode: redir-host  
  
       nameserver:  
  
         - 223.5.5.5  
  
         - 223.6.6.6  
  
         - https://223.5.5.5/resolve  
  
       fallback:  
  
         - 1.1.1.1  
  
         - 208.67.220.222:5353  
  
         - https://dns.rubyfish.cn/dns-query  
  
         - https://doh.opendns.com/dns-query  
  
         - tls://1.1.1.1:853  
  
       fallback-filter:  
  
         geoip: true  
  
   tun:  
  
       enable: true  
  
       stack: gvisor  
  
       dns-hijack:  
  
         - 198.18.0.2:53  
  
       macOS-auto-route: true  
  
       macOS-auto-detect-interface: true  
  
以上为TUN版本  
  
TAP版见下**（请注意，复制的时候会多出空行，这是Telegraph的原因，请自行删除空行）**  
  
mixin:  
  
   dns:  
  
       enable: true  
  
       listen: :53  
  
       default-nameserver:  
  
         - 223.5.5.5  
  
         - 1.1.1.1  
  
       enhanced-mode: redir-host  
  
       nameserver:  
  
         - 223.5.5.5  
  
         - 223.6.6.6  
  
         - https://223.5.5.5/resolve  
  
       fallback:  
  
         - 1.1.1.1  
  
         - 208.67.220.222:5353  
  
         - https://dns.rubyfish.cn/dns-query  
  
         - https://doh.opendns.com/dns-query  
  
         - tls://1.1.1.1:853  
  
       fallback-filter:  
  
         geoip: true  
  
注意缩进  
  
并点击右下角的按键保存  
  
![](https://telegra.ph/file/3b6fb1705057b6f2ec347.png)  
  
TUN版本的Mixin示例  
  
#### (2)开启Mixin  
  
在通用界面打开Mixin，大功完成了  
  
![](https://telegra.ph/file/a27e1a42526eb2e94b7f8.png)  
  
![](https://telegra.ph/file/a0e23664c93f6b0a2b013.png)  
  
不再使用TUN的时候就把Mixin关掉就好了  
  
小提示：可以在设置的末尾部分设置Mixin开关的快捷键  
  
    
  
同样地，如果显示Clash网卡无法连接，请更换Mixin中的DNS（nameserver和fallback）**（请注意，复制的时候会多出空行，这是Telegraph的原因，请自行删除空行）**  
  
或者你可以删掉fallback部分  
  
如下  
  
mixin:  
  
   dns:  
  
       enable: true  
  
       default-nameserver:  
  
         - 223.5.5.5  
  
         - 1.1.1.1  
  
       enhanced-mode: redir-host  
  
       nameserver:  
  
         - 223.5.5.5  
  
         - 223.6.6.6  
  
         - [https://223.5.5.5/resolve](https://223.5.5.5/resolve)  
  
   tun:  
  
       enable: true  
  
       stack: gvisor  
  
       dns-hijack:  
  
         - 198.18.0.2:53  
  
       macOS-auto-route: true  
  
       macOS-auto-detect-interface: true