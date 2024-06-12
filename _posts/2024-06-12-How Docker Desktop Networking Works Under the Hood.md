---  
tags:  
  - docker  
share: true  
blog: _posts  
---  
Modern applications make extensive use of networks. At build time it’s common to `apt-get/dnf/yum/apk install` a package from a Linux distribution’s package repository. At runtime an application may wish to `connect()` to an internal [postgres](https://github.com/docker/awesome-compose/tree/master/nginx-golang-postgres) or [mysql](https://github.com/docker/awesome-compose/tree/master/sparkjava-mysql) database to persist some state, while also calling `listen()` and `accept()` to expose APIs and UIs over TCP and UDP ports. Meanwhile developers need to be able to work from anywhere, whether in an office or at home or on mobile or on a VPN. Docker Desktop is designed to ensure that networking “just works” for all of these use-cases in all of these scenarios. This post describes the tools and techniques we use to make this happen, starting with everyone’s favorite protocol suite: TCP/IP.  
  
### TCP/IP  
  
When containers want to connect to the outside world, they will use TCP/IP. Since Linux containers require a Linux kernel, Docker Desktop includes a helper Linux VM. Traffic from containers therefore originates from the Linux VM rather than the host, which causes a serious problem.  
  
Many IT departments create VPN policies which say something like, “only forward traffic which originates from the **host** over the VPN”. The intention is to prevent the host accidentally acting as a router, forwarding insecure traffic from the Internet onto secure corporate networks. Therefore if the VPN software sees traffic from the Linux VM, it will **not** be routed via the VPN, preventing containers from accessing resources such as internal registries.  
  
Docker Desktop avoids this problem by forwarding all traffic at user-level via [vpnkit](https://github.com/moby/vpnkit), a TCP/IP stack written in [OCaml](https://ocaml.org/) on top of the network protocol libraries of the [MirageOS Unikernel project](https://mirage.io/). The following diagram shows the flow of packets from the helper VM, through vpnkit and to the Internet:  
  
![1 tcpip 1](https://www.docker.com/wp-content/uploads/2022/01/1-TCPIP-1.png "- 1 Tcpip 1")  
  
When the VM boots it requests an address using DHCP. The ethernet frame containing the request is transmitted from the VM to the host over shared memory, either through a [virtio device](https://docs.oasis-open.org/virtio/virtio/v1.1/csprd01/virtio-v1.1-csprd01.html) on Mac or through a “hypervisor socket” ([AF_VSOCK](https://www.man7.org/linux/man-pages/man7/vsock.7.html)) on Windows. Vpnkit contains a virtual ethernet switch ([mirage-vnetif](https://github.com/mirage/mirage-vnetif)) which forwards the request to the DHCP ([mirage/charrua](https://github.com/mirage/charrua)) server.  
  
Once the VM receives the DHCP response containing the VM’s IP address and the IP of the gateway, it sends an ARP request to discover the ethernet address of the gateway ([mirage/arp](https://github.com/mirage/arp)). Once it has received the ARP response it is ready to send a packet to the Internet.  
  
When vpnkit sees an outgoing packet with a new destination IP address, it creates a virtual TCP/IP stack to represent the remote machine ([mirage/mirage-tcpip](https://github.com/mirage/mirage-tcpip)). This stack acts as the peer of the one in Linux, accepting connections and exchanging packets. When a container calls `connect()` to establish a TCP connection, Linux sends a TCP packet with the SYNchronize flag set. Vpnkit observes the SYNchronize flag and calls`connect()` itself from the host. If the `connect()` succeeds, vpnkit replies to Linux with a TCP SYNchronize packet which completes the TCP handshake. In Linux the `connect()` succeeds and data is proxied in both directions ([mirage/mirage-flow](https://github.com/mirage/mirage-flow)). If the `connect()` is rejected, vpnkit replies with a TCP RST (reset) packet which causes the `connect()` inside Linux to return an error. UDP and ICMP are handled similarly.  
  
In addition to low-level TCP/IP, vpnkit has a number of built-in high-level network services, such as a DNS server ([mirage/ocaml-dns](https://github.com/mirage/ocaml-dns)) and HTTP proxy ([mirage/cohttp](https://github.com/mirage/ocaml-cohttp)). These services can be addressed directly via a virtual IP address / DNS name, or indirectly by matching on outgoing traffic and redirecting dynamically, depending on the configuration.  
  
TCP/IP addresses are difficult to work with directly. The next section describes how Docker Desktop uses the Domain Name System (DNS) to give human-readable names to network services.  
  
### DNS  
  
Inside Docker Desktop there are multiple DNS servers:  
  
![2 dns](https://www.docker.com/wp-content/uploads/2022/01/2-DNS-1110x546.png "- 2 Dns")  
  
DNS requests from containers are first processed by a server inside `dockerd`, which recognises the names of other containers on the same internal network. This allows containers to easily talk to each other without knowing their internal IP addresses. For example in the diagram there are 3 containers: “nginx”, “golang” and “postgres”, taken from the [docker/awesome-compose example](https://github.com/docker/awesome-compose/tree/master/nginx-golang-postgres). Each time the application is started, the internal IP addresses might be different, but containers can still easily connect to each other by human-readable name thanks to the internal DNS server inside `dockerd`.  
  
All other name lookups are sent to [CoreDNS](https://coredns.io/) (from the [CNCF](https://www.cncf.io/)). Requests are then forwarded to one of two different DNS servers on the host, depending on the domain name. The domain `docker.internal` is special and includes the DNS name `host.docker.internal` which resolves to a valid IP address for the current host. Although we prefer if everything is fully containerized, sometimes it makes sense to run part of an application as a plain old host service. The special name `host.docker.internal` allows containers to contact these host services in a portable way, without worrying about hardcoding IP addresses.  
  
The second DNS server on the host handles all other requests by resolving them via standard OS system libraries. This ensures that, if a name resolves correctly in the developer’s web-browser, it will also resolve correctly in the developer’s containers. This is particularly important in sophisticated setups, such as pictured in the diagram where some requests are sent over a corporate VPN (e.g. `internal.registry.mycompany`) while other requests are sent to the regular Internet (e.g. `docker.com`).  
  
Now that we’ve described DNS, let’s talk about HTTP.  
  
### HTTP(S) proxies  
  
Some organizations block direct Internet access and require all traffic to be sent via HTTP proxies for filtering and logging. This affects pulling images during build as well as outgoing network traffic generated by containers.  
  
The simplest method of using an HTTP proxy is to explicitly point the Docker engine at the proxy via environment variables. This has the disadvantage that if the proxy needs to be changed, the Docker engine process must be restarted to update the variables, causing a noticeable glitch. Docker Desktop avoids this by running a custom HTTP proxy inside vpnkit which forwards to the upstream proxy. When the upstream proxy changes, the internal proxy dynamically reconfigures which avoids having to restart the Docker engine.  
  
On Mac Docker Desktop monitors the proxy settings stored in system preferences. When the computer switches network (e.g. between WiFi networks or onto cellular), Docker Desktop automatically updates the internal HTTP proxy so everything continues to work without the developer having to take any action.  
  
This just about covers containers talking to each other and to the Internet. How do developers talk to the containers?  
  
### Port forwarding  
  
When developing applications, it’s useful to be able to expose UIs and APIs on host ports, accessible by debug tools such as web-browsers. Since Docker Desktop runs Linux containers inside a Linux VM, there is a disconnect: the ports are open in the VM but the tools are running on the host. We need something to forward connections from the host into the VM.  
  
![3 ports](https://www.docker.com/wp-content/uploads/2022/01/3-ports.png "- 3 Ports")  
  
Consider debugging a web-application: the developer types `docker run -p 80:80` to request that the container’s port 80 is exposed on the host’s port 80 to make it accessible via [http://localhost](http://localhost/). The Docker API call is written to `/var/run/docker.sock` on the host as normal. When Docker Desktop is running Linux containers, the Docker engine (`dockerd` in the diagram above) is a Linux program running inside the helper Linux VM, not natively on the host. Therefore Docker Desktop includes a Docker API proxy which forwards requests from the host to the VM. For security and reliability, the requests are not forwarded directly over TCP over the network. Instead Docker Desktop forwards Unix domain socket connections over a secure low-level transport such as shared-memory hypervisor sockets via processes labeled `vpnkit-bridge` in the diagram above.  
  
The Docker API proxy can do more than simply forward requests back and forth. It can also decode and transform requests and responses, to improve the developer’s experience. When a developer exposes a port with `docker run -p 80:80`, the Docker API proxy decodes the request and uses an internal API to request a port forward via the `com.docker.backend` process. If something on the host is already listening on that port, a human-readable error message is returned to the developer. If the port is free, the com.docker.backend process starts accepting connections and forwarding them to the container via the process `vpnkit-forwarder`, running on top of `vpnkit-bridge`.  
  
Docker Desktop does not run with “root” or “Administrator” on the host. A developer can use `docker run –privileged` to become root inside the helper VM but the hypervisor ensures the host remains completely protected at all times. This is great for security but it causes a usability problem on macOS: how can a developer expose port 80 (`docker run -p 80:80`) when this is considered a “privileged port” on Unix i.e. a port number < 1024? The solution is that Docker Desktop includes a tiny helper privileged service which does run as root from `launchd`and which exposes a “please bind this port” API. This raises the question: “is it safe to allow a non-root user to bind privileged ports?”  
  
Originally the notion of a privileged port comes from a time when ports were used to authenticate services: it was safe to assume you were talking to the host’s HTTP daemon because it had bound to port 80, which requires root, so the admin must have arranged it. The modern way to authenticate a service is via TLS certificates and `ssh` fingerprints, so as long as system services have bound their ports before Docker Desktop has started – macOS arranges this by binding ports on boot with `launchd` –  there can be no confusion or denial of service. Accordingly, modern macOS has made binding privileged ports on all IPs (`0.0.0.0` or `INADDR_ANY`) an unprivileged operation. There is only one case where Docker Desktop still needs to use the privileged helper to bind ports: when a specific IP is requested (e.g. `docker run -p 127.0.0.1:80:80`), which still requires root on macOS.  
  
### Summary  
  
Applications need reliable network connections for lots of everyday activities including: pulling Docker images, installing Linux packages, communicating with database backends, exposing APIs and UIs and much more. Docker Desktop runs in many different network environments: in the office, at home and while traveling on unreliable wifi. Some machines have restrictive firewall policies installed. Other machines have sophisticated VPN configurations. For all these use-cases in all these environments, Docker Desktop aims to “just work”, so the developer can focus on building and testing their application (rather than debugging ours!)  
  
If building this kind of tooling sounds interesting, come and make Docker Desktop networking even better, we are hiring see [https://www.docker.com/career-openings](https://www.docker.com/career-openings)