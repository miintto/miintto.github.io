---
layout: post
title: "Unix Socket 과 TCP Socket은 어떤 차이가 있을까?"
category: network
tags:
  - network
  - osi 7 layer
  - tcp/ip
  - unix domain socket
toc: true
thumbnail: "/img/thumbnails/network-socket.png"
---

일반적으로 웹 어플리케이션을 구동하는 경우 반드시 앞 단에 Apache 혹은 Nginx와 같은 웹서버를 연결하여 서비스합니다.
이때 웹서버와 어플리케이션을 연결할 때 UNIX 소켓을 이용하는 방법과 특정 포트로 연결하는 방법이 있습니다.

```bash
# TCP 통신을 이용하거나
$> gunicorn --bind 0.0.0.0:8000
# 혹은 Unix Socket을 사용하거나
$> gunicorn --bind unix:/usr/src/gunicorn.sock 
```

일례로 gunicorn을 사용할 때 위와 같은 방식을 제안하는데, 두 방법 모두 어플리케이션이 실행되는데에는 큰 문제가 없습니다.
그렇다면 각각 방식으로 실행하는 경우 어떠한 차이가 있고 어떤 방식이 성능상 더 유리한지 한번 확인해봅시다.

---

# 1. OSI 7계층

**OSI 7계층** 구조는 여러 컴퓨터 간의 통신 구조를 7단계로 분리하여 정의한 네트워크 모델입니다.
작업 중인 프로세스가 네트워크 통신이 필요한 경우 전달할 데이터를 7번째 응용 계층으로 보내는데, 해당 데이터는 1번째 물리 계층으로 전송되면서 캡슐화됩니다.
물리 계층에서 데이터는 전기 신호로 바뀌어 목적지 컴퓨터에 전달되고, 다시 1번째 물리 계층부터 7번째 응용 계층으로 이동하면서 캡슐화가 해제되어 원본 데이터를 받을 수 있게 됩니다.

<img src="/img/posts/network-osi-7layers.png" style="max-width:540px"/>

## 1.1 TCP 통신

위에서 설명한 OSI 7계층 중 4번째 **전송 계층**(Transport Layer)는 양 끝단의 사용자에게 신뢰성 있는 데이터 전달을 담당합니다.
흐름 제어, 분할/분리 및 오류 제어 등의 작업을 통해 데이터가 오류 없이 전달되도록 하여 상위 계층들이 데이터 전달의 유효성이나 효율성에 대한 고려 없이 본업에 집중하도록 합니다.

또한 전달할 어플리케이션을 식별하는 역할도 합니다.
고유한 포트(port) 번호를 사용하여 어플리케이션을 구별하는데, 5번째 세션 계층으로부터 받은 데이터에 도착지 어플리케이션의 포트 정보를 헤더로 추가하여 어떤 어플리케이션에 전달해야 하는지 정의합니다.
반대로 3번째 네트워크 계층으로부터 데이터를 받은 경우 헤더의 포트 번호를 가져와서 해당하는 어플리케이션으로 데이터를 전달합니다.

전송 계층의 대표적인 예로 **TCP**(Transmission Control Protoco) 통신이 있습니다.
TCP에서는 신뢰성을 보장하기 위해 3-way Handshaking 방식을 사용합니다.
3-way Handshaking은 데이터를 보내는 클라이언트와 데이터를 받은 서버간에 데이터를 받을 준비가 되었는지 확인하는 과정입니다.

## 1.2 TCP/IP 모델

최근에는 7개의 계층을 좀 더 단순화하여 4단계로 통합한 **TCP/IP 모델**을 많이 사용합니다.
전송 계층의 프로토콜로 TCP를 사용하고 네트워크 계층의 프로토콜로 IP(Internet Protocol)를 사용한 방식입니다.
현재 쓰이는 인터넷이 발전하면서 데이터 통신이 대부분 TCP/IP 통신을 사용하다보니 해당 모델이 거의 표준처럼 사용됩니다.

<img src="/img/posts/network-tcpip-layers.png" style="max-width:540px"/>

---

# 2. TCP/IP Socket

**소켓 통신**은 보통 3~4 게층을 이용하여 프로세스간에 데이터를 주고 받는 방법 메커니즘을 의미합니다.
TCP/IP 소켓 통신은 위에서 설명한 TCP/IP 네트워크를 기반으로 합니다.
주로 물리적으로 분리되어있는 시스템간의 통신에서 사용되지만 loopback 인터페이스(ex. `127.0.0.1`, `::1`)을 사용하면 동일한 컴퓨터에서 실행 중인 프로세스와도 통신할 수 있습니다.

<img src="/img/posts/network-tcpip-socket.png" style="max-width:420px"/>

---

# 3. UNIX Domain Socket

**UNIX Domain Socket**(UDS) 방식은 같은 시스템 내에서 실행되고 있는 프로세스 간의 통신 메커니즘입니다.
기존에는 유닉스 환경에서만 제공되었으나 현재는 Windows환경에서도 사용 가능합니다.

UDS는 응용 계층에서 전송 계층으로 데이터가 전달되고 다시 곧바로 어플리케이션 계층으로 전달됩니다.
반면 TCP/IP 소켓은 TCP/IP 4개 계층을 모두 통과해야 하기 때문에 UDS의 통신 속도가 훨씬 빠릅니다. 
또한 소켓 파일이 물리적으로 존재하기 때문에 파일 시스템에 의해 제어됩니다.
그래서 소켓 파일을 단순히 read, write 하는 방식으로 서로 통신합니다. 
또한 파일 권한을 제한한다면 소켓에 접근 가능한 permission을 제어할수도 있습니다.

<img src="/img/posts/network-unix-socket.png" style="max-width:240px"/>

아래 명령어로 실행중인 유닉스 소켓의 권한을 확인할 수 있습니다.

```bash
$> ls -l /usr/src/gunicorn.sock
srwxrwxrwx 1 root root 0 Jan 15 04:07 /usr/gunicorn.sock
```

파일 사이즈는 0으로 조회되는데 이는 메시지가 내부에 쌓이지 않고 커널로 전달되어 커널에서 처리되기 때문입니다.

---

# 4. 결론

위의 내용에 근거하면 웹서버와 웹 어플리케이션이 같은 서버에 있는 경우 UDS 방식이 훨씬 유리함을 알 수 있습니다.
만일 도커와 같은 컨테이너 기반으로 구동되어 웹서버와 어플리케이션이 분리되어있는 경우는 volume을 걸어 소켓 파일을 호스트와 공유하는 방식으로도 해결 가능합니다.

---

References

- [What is the difference between Unix sockets and TCP/IP sockets?](https://serverfault.com/questions/124517/what-is-the-difference-between-unix-sockets-and-tcp-ip-sockets/124518#124518)
- [OSI 7 계층 - 해시넷](http://wiki.hash.kr/index.php/OSI_7_계층)
- [네트워크 기초(5) - OSI 7계층 - 4계층: 전송 계층](https://losskatsu.github.io/os-kernel/network-basic05/#1-신뢰성)
- [[C/Socket] Network Programming - 패킷, 네트워크, OSI 7계층, 소켓](https://yurmu.tistory.com/23)
- [유닉스 소켓](https://snnchallenge.tistory.com/306)
- [유닉스 도메인 소켓(Unix Domain Socket) 이란?](https://www.lesstif.com/linux-core/unix-domain-socket)
- [Unix Domain Socket](https://www.joinc.co.kr/w/Site/system_programing/IPC/Unix_Domain_Socket)
- [[10분 테코톡] 🔮 히히의 OSI 7 Layer](https://www.youtube.com/watch?v=1pfTxp25MA8)
