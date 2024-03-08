---
layout: post
title: "[쿠버네티스] Architecture"
date: 2022-05-08
category: kubernetes
tags:
  - k8s
  - msa
  - cluster
thumbnail: "/img/thumbnails/k8s-archi.png"
---

예전에는 서비스를 거대한 하나의 프로젝트로 운영하였지만, 최근 들어서는 도메인별로 쪼개어 각각 별도로 배포 및 운영이 가능하도록 나누는 **MSA**가 트렌드로 자리잡기 시작했습니다.
이 방법을 도입하면서 각 도메인마다 특성을 고려하여 필요한 경우 자원을 늘리거나 줄이는 방식으로 유연하게 운영이 가능합니다.

하지만 그에 따라 하나의 서비스를 운영하기 위해 관리해야하는 물리적인 서버가 늘어나게 되었는데, 분산된 많은 프로젝트들을 각각 다른 공간에 배포하는 과정이 다소 번거로워졌습니다.
따라서 적절한 컨테이너를 적절한 공간에 배포하는 스케줄링에 대한 필요성이 늘어나게 되었고, 이런 과정에서 **쿠버네티스**가 등장하게 되었습니다.

저번 포스트에서 간단하게 쿠버네티스 클러스터 환경을 구축하였다면, 이번에는 쿠버네티스의 전체적인 구조를 살펴보고 어떤식으로 활용할 수 있는지 살펴봅시다.

---

<img src="/img/posts/k8s-archi-cluster.png" style="max-width:840px"/>

# 1. Cluster

## 1.1 Control Plane

클러스터의 마스터 역할을 합니다.
클러스터 전체를 관리하며 여러 컨테이너의 life cycle 등을 체크합니다.

실제 서버에 어떤 프로세스가 동작하고 있는지 확인해봅시다.

```bash
$> ps -ef | grep kube
root     29265 29032  1  5월05 ?      00:21:04 kube-controller-manager ...
root     29310 28983  1  5월05 ?      00:22:42 etcd ...
root     29394 29057  0  5월05 ?      00:04:36 kube-scheduler ...
root     29430 29017  5  5월05 ?      01:20:15 kube-apiserver ...
root     29506     1  2  5월05 ?      00:33:54 /usr/bin/kubelet ...
root     29738 29647  0  5월05 ?      00:00:15 /usr/local/bin/kube-proxy ...
```

### 1.1.1 kube-controller-manager

- 노드 컨트롤러: 노드 통제
- 레플리케이션 컨트롤러: 시스템의 모든 레플리케이션 컨트롤러 오브젝트에 대해 알맞은 수의 Pod 유지
- 엔드포인트 컨트롤러: 엔드포인트 오브젝트를 채움으로 서비스와 pod 연결
- 서비스 어카운트 & 토큰 컨트롤러: 새로운 네임스페이스에 대한 기본 계정과 API 접근 토큰 생성

### 1.1.2 etcd

저장소 역할을 합니다.

### 1.1.3 kube-scheduler

컨테이너를 실행할 공간 선별 및 실행을 담당합니다.

### 1.1.4 kube-apiserver

API를 이용하여 쿠버네티스 내의 Pod, Namespace 등을 관리합니다.

## 1.2 Worker Node

**Worker node**는 컨테이너가 실제로 실행되는 공간입니다. Control plane에 의하여 관리됩니다.

### 1.2.1 kubelet

클러스터의 각 노드에서 실행되는 에이전트입니다. 컨테이너가 동작하도록 관리합니다.

---

# 2. 쿠버네티스 오브젝트

쿠버네티스에서는 리소스를 오브젝트라는 형식으로 관리합니다.
사용 가능한 오브젝트는 다음과 같은 유형이 있습니다.

```bash
$> kubectl api-resources
NAME                SHORTNAMES   APIVERSION   NAMESPACED   KIND
bindings                         v1           true         Binding
componentstatuses   cs           v1           false        ComponentStatus
configmaps          cm           v1           true         ConfigMap
endpoints           ep           v1           true         Endpoints
events              ev           v1           true         Event
...
```

위 유형을 모두 숙지할 필요는 없으며 자주 사용되는 것 부터 하나씩 살펴봅시다.

## 2.1 Pod

**Pod**는 하나 이상의 컨테이너 그룹으로 이루어져 있는데, k8s를 구성하는 최소 단위입니다.
일반적으로 하나의 Pod는 완전한 애플리케이션이어야 하기 때문에 여러 컨테이너로 구성된 경우가 많습니다. 

다음과 같이 YML 파일을 작성하여 실행할 수 있습니다.

```yml
# nginx-pod.yml
apiVersion: v1   # 버전
kind: Pod        # 리소스 종류
metadata:        # 리소스 부가 정보 (라벨, 주석, 이름...)
  name: test-nginx-pod
spec:            # 리소스를 생성하기 위한 정보 (컨테이너, )
  containers:
  - name: test-nginx-container
    image: nginx:latest
    ports:
    - containerPort: 80
      protocol: TCP
```

간단한 nginx 애플리케이션을 구동시키는 Pod를 생성합니다.

```bash
$> kubectl apply -f nginx-pod.yml
$> kubectl get pods
NAME             READY   STATUS    RESTARTS   AGE
test-nginx-pod   1/1     Running   0          8s
```

Pod 정보를 조회해보면 네임스페이스, 컨테이터 런타임, IP 등 정보를 조회할 수 있습니다.

```bash
$> kubectl describe pods test-nginx-pod
Name:         test-nginx-pod
Namespace:    default
Priority:     0
Node:         ip-172-xx-xx-211.ap-northeast...
Start Time:   Sun, 08 May 2022 17:20:31 +0900
Labels:       <none>
Annotations:  cni.projectcalico.org/containerID: 3b4afe9085e946439a8fce75569774facb503cdf8b207a55a1b3bcd810ed3e81
              cni.projectcalico.org/podIP: 172.16.176.139/32
              cni.projectcalico.org/podIPs: 172.16.176.139/32
Status:       Running
IP:           172.16.176.139
IPs:
  IP:  172.16.176.139
Containers:
  test-nginx-container:
    Container ID:   containerd://0eeea64153d3e31ebc938a030272d15a5ac4f9bc9d52685cedfeee2a8671f6dd
    Image:          nginx:latest
    Image ID:       docker.io/library/nginx@sha256:859ab6768a6f26a79bc42b231664111317d095a4f04e4b6fe79ce37b3d199097
    Port:           80/TCP
    Host Port:      0/TCP
    State:          Running
      Started:      Sun, 08 May 2022 17:20:33 +0900
    Ready:          True
    Restart Count:  0
    Environment:    <none>
    Mounts:
      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-qhcc9 (ro)
...
```

도커 컨테이너와 비슷하게 Pod 생성시 컨테이너 IP가 할당되어 클러스터 내부에서 접근할 수 있습니다.
해당 IP로 호출해보면 nginx 애플리케이션에 접근할 수 있습니다.

```bash
$> curl 172.16.176.139
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
...
```
다만 해당 IP는 클러스터 내부에서 할당한 IP 이기 때문에 쿠버네티스 외부에서는 접근할 수 없습니다.

실행중인 Pod를 삭제하려면 아래와 같이 입력합니다.

```bash
$> kubectl delete -f nginx-pod.yml
```


## 2.2 Deployment

**Deployment**는 Pod 들을 묶어서 관리하는 오브젝트 입니다.
Deployment를 생성하면 대응되는 ReplicaSet도 함께 생성됩니다.
일정한 Pod의 개수를 유지시키는 ReplicaSet의 기능 외에도 배포시 revision을 남겨 롤백이 용이하게 하고, 롤링 업데이트 기능을 지원하여 무중단 배포를 가능하게 하는 등 애플리케이션을 배포 및 관리하는 역할을 합니다.

아래 방식대로 YML 파일을 작성합니다.
`template` 하위는 Pod를 생성할 때 작성했던 모양과 거의 흡사합니다.
기존 Pod 형식에 라벨만 추가하여 하나로 묶어주었습니다.

```yml
# nginx-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-nginx-deployment
spec:
  replicas: 2
  selector:      # ReplicaSet 정의
    matchLabels:
      app: test-nginx
  template:      # Pod 정의
    metadata:
      name: test-nginx-pod
      labels:
        app:
          test-nginx
    spec:
      containers:
      - name: test-nginx-container
        image: nginx:latest
        ports:
        - containerPort: 80
```

```bash
$> kubectl apply -f nginx-deployment.yml
$> kubectl get pods
NAME                                     READY   STATUS    RESTARTS   AGE
test-nginx-deployment-755d478cc5-dbh6p   1/1     Running   0          11s
test-nginx-deployment-755d478cc5-pbfwn   1/1     Running   0          12s
```

이때 Pod의 개수를 2개에서 3개로 늘려봅시다.
먼저 YML 파일에서 replica 개수를 조절합니다.

```yml
# nginx-deployment.yml
...
spec:
  replicas: 3
  ...
```

변경한 내용을 쿠버네티스에 적용합니다.
전체 Pod를 지우고 생성한 것이 아니라 필요한 Pod만 생성되었습니다.

```bash
$> kubectl apply -f nginx-deployment.yml
deployment.apps/test-nginx-deployment configured
$> kubectl get pods
NAME                                     READY   STATUS    RESTARTS   AGE
test-nginx-deployment-755d478cc5-dbh6p   1/1     Running   0          2m30s
test-nginx-deployment-755d478cc5-fmnn6   1/1     Running   0          8s
test-nginx-deployment-755d478cc5-pbfwn   1/1     Running   0          2m31s
```

이번에는 nginx의 이미지를 변경해봅시다.
다시 YML 파일에서 이미지 버전을 1.11로 바꿉니다.

```yml
# nginx-deployment.yml
      ...
      containers:
        image: nginx:1.11
        ...
```

다시 적용해보면 이번에는 모든 Pod가 새로 생성된 것을 확인할 수 있습니다.

```bash
$> kubectl apply -f nginx-deployment.yml
deployment.apps/test-nginx-deployment configured
$> kubectl get pods
NAME                                     READY   STATUS    RESTARTS   AGE
test-nginx-deployment-67bc75486f-4n42q   1/1     Running   0          27s
test-nginx-deployment-67bc75486f-7bqf9   1/1     Running   0          44s
test-nginx-deployment-67bc75486f-snr4j   1/1     Running   0          31s
```

ReplicaSet을 확인해보면 예전 버전이 지워지지 않고 남아있는 것을 확인할 수 있습니다. 

```bash
$> kubectl get replicaset
NAME                               DESIRED   CURRENT   READY   AGE
test-nginx-deployment-67bc75486f   3         3         3       1m7s
test-nginx-deployment-755d478cc5   0         0         0       4m21s
```

Deployment에서는 Pod 들이 새로 업데이트 되어도 이전 정보들을 revision으로 보관하고 있어서 롤백에 용이하게 합니다.
보관된 revision 정보는 다음과 같이 조회할 수 있습니다.

```bash
$> kubectl rollout history deployment test-nginx-deployment
deployment.apps/test-nginx-deployment
REVISION  CHANGE-CAUSE
1         kubectl apply --filename=nginx-deployment.yml --record=true
2         <none>
```

만일 다시 이전 버전으로 돌리고 싶다면 다음과 같이 실행하면 됩니다.

```bash
$> kubectl rollout undo deployment test-nginx-deployment --to-revision=1
deployment.apps/test-nginx-deployment rolled back
```

다시 이전 버전으로 되돌아간 것을 확인할 수 있습니다.

```bash
$> kubectl get replicaset
NAME                               DESIRED   CURRENT   READY   AGE
test-nginx-deployment-67bc75486f   0         0         0       7m24s
test-nginx-deployment-755d478cc5   3         3         3       10m
$> kubectl get pods
NAME                                     READY   STATUS    RESTARTS   AGE
test-nginx-deployment-755d478cc5-8kt7r   1/1     Running   0          25s
test-nginx-deployment-755d478cc5-gfw85   1/1     Running   0          32s
test-nginx-deployment-755d478cc5-vfthk   1/1     Running   0          29s
```


## 2.3 Service

Deployment에서 `containerPort`를 정의하긴 했지만 해당 포트는 클러스터 내부에서만 사용 가능하고 외부에서는 접근할 수 없습니다.
또한 Pod를 다시 생성한 경우 컨테이너의 IP도 바뀔수 있습니다.
이때, **Service**는 가변하는 Pod IP를 고정하는 도메인을 설정하여 쿠버네티스 외부에서 Pod로 접근이 가능하도록 합니다.
또한 여러개의 Pod로 네트워트를 분산시키는 로드밸런서 역할도 합니다.

```yml
# nginx-service.yml
apiVersion: v1
kind: Service
metadata:
  name: test-nginx-service
spec:
  ports:
  - name: web-port
    port: 8080
    targetPort: 80  # Pod의 containerPort와 일치해야 합니다.
  selector:
    app: test-nginx
  type: ClusterIP  # 형식 (ClusterIP, NodePort, LoadBalancer, ..)
```

`spec.selector`에서 적용할 Pod를 명시합니다.
위의 YML파일에 따르면 `app=test-nginx` 를 라벨로 가진 Pod들에 접근할 수 있는 Service를 생성합니다.

`spec.type`에서는 어떤 형식의 Service를 생성할지 정의합니다.
아무것도 정의하지 않으면 기본적으로 _ClusterIP_ 로 설정됩니다.

- ClusterIP: 클러스터 내부에서만 접근 가능한 IP를 할당합니다.
- NodePort: 클러스터에 접근 가능한 IP와 더불어 port가 할당됩니다.
- LoadBalancer: 

우선 위에서 작성한대로 ClusterIP 타입의 Service를 생성합니다.

```bash
$> kubectl apply -f nginx-service.yml
service/test-nginx-service configured
$> kubectl get service
NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
kubernetes           ClusterIP   10.96.0.1       <none>        443/TCP    23m
test-nginx-service   ClusterIP   10.100.152.18   <none>        8080/TCP    6s
```

새로운 IP가 할당되었습니다. 해당 IP와 port로 요청하면 nginx 애플리케이션에 접근할 수 있습니다.

```bash
$> curl 10.100.152.18:8080
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
...
```

이번에는 type을 NodePort 로 변경해보겠습니다.

```bash
$> kubectl get service
NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
kubernetes           ClusterIP   10.96.0.1       <none>        443/TCP          26m
test-nginx-service   NodePort    10.100.152.18   <none>        8080:30471/TCP   2m25s
```

ClusterIP 와 거의 유사하지만 30471 라는 새로운 포트가 할당되었습니다.
이 상태에서는 쿠버네티스 클러스터의 30471 포트로 접근하는 모든 네트워크는 해당 nginx 애플리케이션으로 연결됩니다.

```bash
$> curl 127.0.0.1:30471
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```

만일 노드에 30471 포트를 개방해두었다면 쿠버네티스 외부에서도 동일하게 접근이 가능합니다.
다만 이 경우에는 노드의 public IP를 이용해서 접근해야 합니다.

## 2.4 Namespace

**Namespace**는 컨테이너 등의 리소스들을 논리적으로 구분하는 그룹입니다.
Pod, Deployment 등 리소스 생성시 Namespace를 명시할 수 있습니다. 

다음과 같이 현재 구성되어있는 Namespace를 확인할 수 있습니다. 

```bash
$> kubectl get namespaces
NAME              STATUS   AGE
default           Active   29m
kube-node-lease   Active   29m
kube-public       Active   29m
kube-system       Active   29m
```

아무 조건이 없으면 기본적으로 'default' Namespace 에서 생성됩니다.
앞에서 생성한 nginx Pod들은 따로 설정을 하지 않았으므로 모두 default Namespace 에서 조회할 수 있습니다.

```bash
$> kubectl get pods --namespace default
NAME                                     READY   STATUS    RESTARTS   AGE
test-nginx-deployment-755d478cc5-8kt7r   1/1     Running   0          19m
test-nginx-deployment-755d478cc5-gfw85   1/1     Running   0          19m
test-nginx-deployment-755d478cc5-vfthk   1/1     Running   0          19m
```

---

References

- 용찬호, 시작하세요! 도커/쿠버네티스, 위키북스, 2020-01-03
- [쿠버네티스 문서](https://kubernetes.io/ko/docs/home/)
