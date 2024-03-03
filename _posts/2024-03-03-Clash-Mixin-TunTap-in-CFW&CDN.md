---  
blog: _posts  
share: true  
---  
This time, we introduce the use of Clash for Windows (hereinafter referred to as CFW) and Clash .Net (hereinafter referred to as CDN) two software mixin function to realize the TUN/TAP virtual network card to take over the flow of traffic  
  
As of the completion of this article, the latest version of CFW is 0.15.5 and the latest version of CDN is 1.0.3  
  
This example to the portable version as an example, the two software portable method is to download the zip package, in the unzipped folder out of the new data folder, configuration files and so on will be saved in it, update only need to move the data folder!  
  
1, TUN / TAP very shallow point of clarification  
  
(1) What is TUN/TAP?  
  
TUN is a feature exclusive to clash's Premium core that allows you to use a virtual NIC to take over traffic, while TAP is a CFW feature, not a clash core feature, that also allows you to use a virtual NIC to take over traffic.  
  
(2) What is TUN/TAP for?  
  
Let's not discuss the understanding of global proxy (if you don't know what I mean, just take it as I didn't say it well) The two clients (CFW and CDN) introduced in this presentation have the function of system proxy, but the system proxy can't solve the problem of proxy for all the programs. For example, when using the uwp application, it is not possible to specify the local proxy by default; when playing the game, it doesn't go through the proxy. The traditional way is to use enableloopback for uwp applications, use Netch for games, and some people use proxifier, etc. However, we can use TUN/TAP to set up a virtual NIC to take over the program traffic to achieve the purpose of mandatory proxy That is to say, as long as the clash is configured properly, it can also accomplish what other software can accomplish.  
  
