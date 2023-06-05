---
layout: post
title: "[쿠버네티스] 무작정 설치해보기"
date: 2022-05-05
category: kubernetes
tags:
  - k8s
  - aws
  - cluster
banner: "/img/posts/k8s-install-banner.png"
---

쿠버네티스는 컨테이너화된 애플리케이션을 자동으로 배포, 스케일링 및 관리해주는 오픈소스입니다.
이제는 백엔드를 한다면 빗겨갈수 없는 기술이 되어버린 터라 공부의 필요성은 계속 느껴왔는데요.
내일 공부해야지 하고 차일 피일 미루다 영영 기약이 없을것 같아서...
어디다가 설치라도 해보면 그래도 조금은 들여다 보겠지 싶어 무작정 설치부터 해보았습니다.

---

# 1. 사전 작업

## 1.1 인스턴스

쿠버네티스를 제대로 활용하기 위해서는 최소 3개 이상의 인스턴스가 필요합니다.
또한 각 인스턴스는 2GB 이상의 메모리 2 CPU 이상의 자원이 필요합니다.
해당 리소스보다 부족한 경우 애플리케이션이 제대로 가동되지 않을 수 있습니다.
이번 과정에서는 마스터 노드 1개, 워커 노드 2개로 구성하였고 자세한 구성 환경은 다음과 같습니다.

- OS: Amazon Linux 2
  - 4GB RAM / 2 vCPU
- Kubernetes: v1.24.0
- Runtime: Docker v20.10.7

## 1.2 서버 시간 동기화

각 인스턴스는 서버의 시간이 동기화 되어있어야합니다.
일반적으로 ntp를 사용하지만 Amazon Linux 2 에서는 기본적으로 **chrony** 라는 인터페이스가 설치되어 있으므로 ntp 대신 활용하였습니다.

```bash
$> vim /etc/chrony.conf
# 아래 내용 체크
server 169.254.169.123 prefer iburst minpoll 4 maxpoll 4

$> chronyc tracking  # 지표 확인
Reference ID    : A9FEA97B (169.254.169.123)
Stratum         : 4
Ref time (UTC)  : Thu May 05 04:58:48 2022
System time     : 0.000001882 seconds slow of NTP time
Last offset     : -0.000000258 seconds
...

$> sudo cp -av /usr/share/zoneinfo/Asia/Seoul /etc/localtime  # KST로 변경
$> date
2022. 05. 05. (목) 14:01:46 KST
```

## 1.3 고유한 MAC 주소 확인

클러스터를 구성하는 노드들은 서로간에 고유한 MAC 주소 및 product_uuid를 가지고 있어야 합니다.

```bash
# 주소 비교
$> ifconfig | egrep "^\\w|ether"

# product_uuid 비교
$> sudo cat /sys/class/dmi/id/product_uuid
```

## 1.4 스왑 메모리 해제

메모리 스왑이 활성되어 있으면 컨테이너의 성능이 일관되지 않을 수 있으므로 비활성화 해줍니다.

```bash
$> swapoff -a
```

## 1.5 특정 포트 개방

6443번 포트는 마스터 노드의 API 서버가 노드간 통신을 위해 사용하는 포트입니다.
해당 포트가 개방되어있는지 체크합니다.
저는 AWS 인스턴스를 사용하여 해당 인터페이스에서 조정하였습니다.

```bash
$> telnet 127.0.0.1 6443
```

## 1.6 런타임 설치

노드에서 Pod를 실행할 수 있도록 각 노드마다 컨테이너 런타임이 필요합니다.
쿠버네티스는 Docker, Containerd, Cri-O 등의 런타임을 지원하지만 가장 보편적으로 사용하는 Docker를 설치하겠습니다.

```bash
$> sudo yum update -y
$> sudo amazon-linux-extras install -y docker
$> sudo systemctl enable docker.service
$> sudo systemctl start docker.service
```

Cgroup은 컨테이너에 할당된 리소스를 관리하는 기능입니다.
기본적으로 `cgroupfs` 으로 되어있지만 `systemd`로 변경하는것을 권장합니다.

```bash
$> docker info | grep Cgroup
 Cgroup Driver: cgroupfs
 Cgroup Version: 1

$> vim /lib/systemd/system/docker.service
# native.cgroupdriver=systemd 로 변경
ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock --exec-opt native.cgroupdriver=systemd

$> sudo systemctl daemon-reload
$> sudo systemctl restart docker.service

$> docker info | grep Cgroup
 Cgroup Driver: systemd
 Cgroup Version: 1
```

>❗️ 나중에 설치하고서야 알게된 사실인데, 쿠버네티스가 1.20 버전부터는 런타임으로 도커 엔진을 지원하지 않는다고 합니다ㅠㅠ 다행히 도커를 설치하면서 곁다리로 containerd가 딸려와서 대신 활용하도록 하겠습니다.

---

# 2. 쿠버네티스 설치

쿠버네티스를 설치하는 과정은 kubeadm, kops등 여러 방법으로 가능하지만, 가장 보편적인 kubeadm를 이용한 방법으로 진행하겠습니다.

## 2.1 kubeadm 설치

먼저 kubeadm을 가져오기 위해 repo를 등록합니다.

```bash
$> cat <<EOF | sudo tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-\$basearch
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
exclude=kubelet kubeadm kubectl
EOF
```

Selinux 설정을 해제합니다.
가이드에는 컨테이너가 파일 시스템에 접근이 가능하도록 허용하기 위함이라고 하는데 kubelet 설치 과정에서 일부 권한의 제약이 있는 듯 합니다.

```bash
$> sudo setenforce 0
$> sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
```

kubelet, kubeadm, kubectl 를 설치합니다.

```bash
$> sudo yum install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
$> sudo systemctl enable --now kubelet
$> kubeadm version
kubeadm version: &version.Info{Major:"1", Minor:"24", GitVersion:"v1.24.0", ...
```

kubeadm 설치 중 다음과 같은 에러가 나는 경우가 있는데 

```bash
repomd.xml signature could not be verified for kubernetes
```

정식 해결 방법은 아니지만 `repo_gpgcheck=0` 으로 해제 후 다시 설치를 이어갑니다.

## 2.2 클러스터 구성

마스터 노드로 사용할 인스턴스에 먼저 클러스터를 초기화 합니다.

```bash
$> sudo kubeadm init

...
Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

Alternatively, if you are the root user, you can run:

  export KUBECONFIG=/etc/kubernetes/admin.conf

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 172.xx.xx.180:6443 --token o2eccn... \
	--discovery-token-ca-cert-hash sha256:8e72e...
```

실행이 완료되면 여러 설명이 나오는데 초기 구성시 실행해야할 명령어 및 애드온 추가 방법에 대한 내용입니다.
마지막에 나온 토큰값은 워커 노드가 마스터로 합류할 때 필요하니 기억해두도록 합니다.
설치시 root 권한으로 진행했기 때문에 다음 명령어를 입력합니다.

```bash
$> export KUBECONFIG=/etc/kubernetes/admin.conf
```

## 2.3 네트워크 애드온 설치

컨테이너간 원할한 네트워크 통신을 위해 calico를 설치합니다.
작성하는 시점 기준으로는 v3.22가 가장 최신이라 해당 버전으로 설치하였습니다.

```bash
$> kubectl apply -f https://docs.projectcalico.org/v3.22/manifests/calico.yaml
$> kubectl get pods --namespace kube-system
NAME                              READY   STATUS    RESTARTS   AGE
calico-kube-controllers-7748...   1/1     Running   0          50s
calico-node-bxfj2                 1/1     Running   0          50s
...
```

컴포넌트를 조회하여 모두 `Running` 상태이면 정상적으로 설치가 완료된 상태입니다.

## 2.4 워커 노드 합류

마스터 노드의 토큰값을 이용하여 각 워커 노드에서 다음을 실행하여 마스터 노드로 합류합니다.

```bash

$> kubeadm join 172.xx.xx.180:6443 --token o2eccn... \
	--discovery-token-ca-cert-hash sha256:8e72e...

...
This node has joined the cluster:
* Certificate signing request was sent to apiserver and a response was received.
* The Kubelet was informed of the new secure connection details.

Run 'kubectl get nodes' on the control-plane to see this node join the cluster.
``` 

만일 토큰이 기억나지 않거나 만료되었다면 다시 조회할 수 있습니다.

``` bash
$> kubeadm token list
TOKEN       TTL         EXPIRES                USAGES                  ...
o2eccn...   40m         2022-05-08T06:48:42Z   authentication,signing  ...

$> openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt | openssl rsa -pubin -outform der 2>/dev/null | openssl dgst -sha256 -hex
(stdin)= 8e72e...
```

노드의 상태를 조회하여 정상적으로 클러스터가 구성되었는지 확인합니다.

```bash
$> kubectl get nodes
NAME                               STATUS   ROLES           AGE     VERSION
ip-172-xx-xx-180.ap-northeast...   Ready    control-plane   7m9s    v1.24.0
ip-172-xx-xx-73.ap-northeast...    Ready    <none>          10s     v1.24.0
ip-172-xx-xx-221.ap-northeast...   Ready    <none>          15s     v1.24.0
```

---

References

- 용찬호, 시작하세요! 도커/쿠버네티스, 위키북스, 2020-01-03
- [kubeadm 설치하기](https://kubernetes.io/ko/docs/setup/production-environment/tools/kubeadm/install-kubeadm/)
- [Linux 인스턴스의 시간 설정](https://docs.aws.amazon.com/ko_kr/AWSEC2/latest/UserGuide/set-time.html)
- [컨테이너 런타임](https://kubernetes.io/ko/docs/setup/production-environment/container-runtimes/)
- [배포 도구로 쿠버네티스 설치하기](https://kubernetes.io/ko/docs/setup/production-environment/tools/_print/)
