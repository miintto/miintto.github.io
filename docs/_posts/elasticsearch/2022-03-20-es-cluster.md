---
layout: post
title: "[엘라스틱서치] 클러스터 구성"
category: elasticsearch
tags:
  - elasticsearch
  - kibana
  - aws
  - cluster
toc: true
thumbnail: "/img/thumbnails/elasticsearch.png"
---

엘라스틱서치 클러스터를 구성하여 실행시켜 봅시다. 
기본적으로 엘라스틱서치가 Java 기반이라 실행 환경을 직접 구성하기 번거로워 도커 이미지를 활용하였습니다.
엘리스틱서치 버전은 2022년 2월에 새로 릴리즈된 8.0 을 기준으로 작성하였습니다.

---

# 1. 단일 노드 구성

먼저 단일 노드 구성하여 실행해봅시다. 단일 노드로 실행하면 노드 하나가 마스터와 데이터의 역할을 동시에 가져갑니다.

## 1.1 Config Files
```yml
# elasticsearch.yml
cluster.name: "es-cluster"
discovery.type: "single-node"
network.host: 0.0.0.0

xpack.security.enabled: true
```
Config 파일은 위와 같이 구성하였습니다.
`discover.type` 값을 single-node 로 설정한 경우에는 단일 노드로만 운영이 가능합니다.

## 1.2 Run

키바나까지 실행할 것을 염두하여 elastic stack 끼리 공유할 네트워크를 생성합니다.

```bash
$> docker network create elastic
```

생성한 네트워크를 이용하여 엘라스틱서치 이미지를 실행시킵니다. Java 힙 메모리는 1GB로 설정하였습니다.

```bash
$> docker run -d --name elasticsearch \
       --net elastic \
       -p 9200:9200 -p 9300:9300 \
       -e ES_JAVA_OPTS="-Xms1g -Xmx1g" \
       -v `pwd`/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml \
       docker.elastic.co/elasticsearch/elasticsearch:8.0.1

8.0.1: Pulling from elasticsearch/elasticsearch
4fb807caa40a: Pull complete
939e6d6de1cd: Pull complete
c6e272a692c1: Pull complete
c35cf7d81655: Extracting  127.6MB/573.9MB
00b951a3ddcb: Download complete
c1686887c5ec: Download complete
c9c4cd9d9e71: Download complete
ff28b3874cac: Download complete
d8fe9cb3f525: Download complete
8287b1c3b76d: Download complete

$> docker ps
CONTAINER ID   IMAGE                                                 COMMAND                  ...
e775a4a0c6ef   docker.elastic.co/elasticsearch/elasticsearch:8.0.1   "/bin/tini -- /usr/l…"   ...
```

## 1.3 Check

커맨드 라인에서 curl을 이용하여 엘라스틱서치에 직접 요청을 보낼 수 있습니다.

```bash
$> curl -XGET http://localhost:9200?pretty=true
{
  "error" : {
    "root_cause" : [
      {
        "type" : "security_exception",
        "reason" : "missing authentication credentials for REST request [/?pretty=true]",
        "header" : {
          "WWW-Authenticate" : [
            "Basic realm=\"security\" charset=\"UTF-8\"",
            "ApiKey"
          ]
        }
      }
    ],
    "type" : "security_exception",
    "reason" : "missing authentication credentials for REST request [/?pretty=true]",
    "header" : {
      "WWW-Authenticate" : [
        "Basic realm=\"security\" charset=\"UTF-8\"",
        "ApiKey"
      ]
    }
  },
  "status" : 401
}
```

하지만 에러가 발생합니다. 클라이언트의 패스워드를 설정해주지 않았기 때문입니다.
엘라스틱서치가 실행되고 있는 컨테이너 내부로 들어가 패스워드 재설정 작업을 해줍니다.

```bash
$> docker exec -it elasticsearch /usr/share/elasticsearch/bin/elasticsearch-setup-passwords interactive 

...
Changed password for user [elastic]
Changed password for user [kibana]
Changed password for user [logstash_system]
Changed password for user [beats_system]
Changed password for user [remote_monitoring_user]

```

비밀번호 변경이 완료되면 다시 엘라스틱서치를 호출합니다.

```bash
$> curl -u elastic:<비밀번호> -XGET http://localhost:9200?pretty=true
{
  "name" : "6287fc9a063f",
  "cluster_name" : "es-cluster",
  "cluster_uuid" : "KrVtgZ0tSR2Xyt2STj5-7Q",
  "version" : {
    "number" : "8.0.1",
    "build_flavor" : "default",
    "build_type" : "docker",
    "build_hash" : "801d9ccc7c2ee0f2cb121bbe22ab5af77a902372",
    "build_date" : "2022-02-24T13:55:40.601285296Z",
    "build_snapshot" : false,
    "lucene_version" : "9.0.0",
    "minimum_wire_compatibility_version" : "7.17.0",
    "minimum_index_compatibility_version" : "7.0.0"
  },
  "tagline" : "You Know, for Search"
}
```

정상적으로 응답이 오는 것을 확인할 수 있습니다.

## 1.4 Kibana

모니터링 인터페이스 구성을 위해 키바나도 추가하였습니다.
```yml
# kibana.yml
server.name: "kibana"
server.host: 0.0.0.0
elasticsearch.hosts: [ "http://elasticsearch:9200" ]
monitoring.ui.container.elasticsearch.enabled: true

elasticsearch.username: kibana_system
elasticsearch.password: ****
```
```bash
$> docker run -d --name kibana \
       --net elastic \
       -p 5601:5601 \
       -v `pwd`/kibana.yml:/usr/share/kibana/config/kibana.yml \
       docker.elastic.co/kibana/kibana:8.0.1

$> docker ps
CONTAINER ID   IMAGE                                                 COMMAND                  ...
d3be996ea7ea   docker.elastic.co/kibana/kibana:8.0.1                 "/bin/tini -- /usr/l…"   ...
e775a4a0c6ef   docker.elastic.co/elasticsearch/elasticsearch:8.0.1   "/bin/tini -- /usr/l…"   ...
```

엘라스틱서치와 키바나 모두 docker network 를 사용하고 있으므로 `elasticsearch.hosts` 설정시 "localhost" 가 아닌 명시된 _CONTAINER NAME_ 으로 설정하여 연결해야 합니다.

<img src="/img/posts/es-cluster-kibana.png" style="max-width:720px"/>

이미지를 실행한 인스턴스 IP 혹은 도메인의 5601 포트로 진입하면 키바나 화면을 볼 수 있습니다.
아까 설정해 주었던 비밀번호를 입력하여 로그인합니다.
username 은 기본적으로 "elastic" 입니다.

> 추가적으로 깃허브 [deviantony/docker-elk](https://github.com/deviantony/docker-elk) 에서는 docker-compose 를 이용한 스크립트를 제공하고 있습니다. 본 포스트에서는 logstash 는 다루지 않으니 해당 부분만 제거하고 실행하면 간편하게 구성이 가능합니다.

---

# 2. 클러스터 구성
## 2.1 환경 설정

단일 클러스터로 설정한 경우 로컬 환경에서 구동해도 큰 문제가 없습니다.
하지만 클러스터로 구성하는 경우 여러 인스턴스가 필요하기 때문에 단순히 로컬에서 테스트 하기에는 한계가 있습니다.
이번 엘라스틱서치 클러스터 구성을 테스트하기 위해 클라우드 서비스를 제공해주는 AWS를 활용하였습니다.

노드 구성은 마스터 노드 1개, 데이터 노드 3개로 총 4개 인스턴스를 가진 클러스터로 구상하였습니다.
인스턴스는 모두 EC2 t3.medium 인스턴스(_vCPU 2 / Memmory: 4GB_)를 사용하였고 각 노드마다 2GB의 힙 메모리로 설정하였습니다.

<img src="/img/posts/es-cluster-cluster.png" style="max-width:540px"/>

```yml
cluster.name: "es-cluster"  # 동일하게 설정
node.name: 노드 이름
node.roles: ["master"]  # 데이터 노드는 ["data"]
bootstrap.memory_lock: true
network.host: _site_
network.publish_host: 각 인스턴스의 IP
discovery.seed_hosts: [클러스터링할 노드의 IP, ... ]
cluster.initial_master_nodes: [마스터 노드 리스트, ...]
xpack.license.self_generated.type: trial
xpack.security.enabled: false
```

클러스터 모드로 실행하는 경우 elasticsearch.yml 파일은 보통 노드마다 별개로 관리하는 것을 추천드립니다.

- `cluster.name` 은 각 노드마다 모두 동일하게 설정해야 합니다. 만일 클러스터를 구성하려는 노드들끼리 `cluster.name` 이 일치하지 않는 경우 클러스터를 구성하지 않고 독자적으로 클러스터를 구성하게 됩니다. 
- `node.name` 은 각 노드의 고유한 이름인데 "master-1", "data-1" 와 같이 명시적으로 표기하는게 좋습니다. 
- `node.roles` 은 해당 노드의 역할을 의미합니다.
- `discovery.seed_hosts` 는 클러스터를 구성할 노드의 IP 혹은 도메인들을 리스트 형태로 설정합니다.

### 2.1.1 Discovery

각 노드가 다른 노드를 탐색하여 하나의 클러스터를 구성하는 과정을 **discovery** 라고 합니다.
하나의 노드가 실행되면 보통 다음의 과정을 거치며 클러스터를 구성합니다.

1. `discovery.seed_hosts` 에 있는 노드를 하나씩 탐색하여 `cluster.name` 을 확인합니다.
2. 탐색한 노드의 `cluster.name`이 일치하면 해당 클러스터에 합류합니다.
3. `cluster.name`이 일치하지 않으면 다시 1. 로 돌아가 다음 노드를 탐색합니다.
4. `discovery.seed_hosts`에 설정된 노드를 찾지 못하거나 탐색한 모든 노드의 `cluster.name`이 일치하지 않으면 독자적으로 클러스터를 구성합니다.

### 2.1.2 Network

`network.hosts` 는 Elasticsearch가 실행되는 서버의 IP 주소입니다.
서버의 주소를 static 하게 설정할 수도 있지만 다음과 같이 정의된 특별한 변수값을 설정할 수도 있습니다.

- `_local_` : 127.0.0.1과 같은 시스템의 루프백 주소
- `_site_` : 시스템의 로컬 IP 주소
- `_global_` : 네트워크 외부에서 바라보는 주소

기본적으로 `_local_` 로 설정되어 있지만 실제 서버의 IP 주소를 입력하면 개발 모드가 아닌 운영 모드로 전환됩니다.
IP가 가변하는 환경에서는 `network.host: _site_` 로 설정해두면 자동으로 해당 로컬 네트워크로 설정되기 때문에 클러스터 구성시 주로 이렇게 설정합니다.
Elasticsearch를 도커 컨테이너 내부에서 실행하는 경우 `_site_` 는 도커 컨테이너의 IP로 설정됩니다.
이런 경우에는 추가적으로 `network.publish_host` 도 설정해주어 외부에서 접속이 가능하도록 합니다.


## 2.2 실행

각 인스턴스마다 엘라스틱서치를 실행하여줍니다

```bash
$> docker run -d \
       --name elasticsearch \
       -p 9200:9200 -p 9300:9300 \
       -e ES_JAVA_OPTS="-Xms2g -Xmx2g" \
       -v `pwd`/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml \
       docker.elastic.co/elasticsearch/elasticsearch:8.0.1
```

도커 컨테이너가 모두 구동되면 엘라스틱서치를 호출하여 클러스터가 제대로 구성되었는지 체크합니다.

```bash
$> curl -XGET http://localhost:9200/
{
  "name" : "master-1",
  "cluster_name" : "es-cluster",
  "cluster_uuid" : "kwckKcp2SHugiFtr2tpbUw",
  "version" : {
    "number" : "8.0.1",
    "build_flavor" : "default",
    "build_type" : "docker",
    "build_hash" : "801d9ccc7c2ee0f2cb121bbe22ab5af77a902372",
    "build_date" : "2022-02-24T13:55:40.601285296Z",
    "build_snapshot" : false,
    "lucene_version" : "9.0.0",
    "minimum_wire_compatibility_version" : "7.17.0",
    "minimum_index_compatibility_version" : "7.0.0"
  },
  "tagline" : "You Know, for Search"
}

$> curl -XGET http://localhost:9200/_cat/nodes?v=true
ip            heap.percent ram.percent cpu load_1m load_5m load_15m node.role master name
3.xxx.xxx.51            11          96   0    0.00    0.01     0.08 d         -      data-2
15.xxx.xxx.254          12          96   3    0.00    0.02     0.08 d         -      data-3
52.xxx.xxx.164          33          89  11    0.06    0.02     0.00 m         *      master-1
3.xxx.xxx.37            13          97   0    0.00    0.00     0.07 d         -      data-1
```

4대의 서버가 연결되어 클러스터를 구성한 것을 확인할 수 있습니다.
_"master-1"_ 노드가 마스터 노드의 역할을 하고 있습니다.

---

# 3 회고 및 보완점

단일 노드로는 쉽게 적용되는 부분들이 클러스터를 구성하는 경우 쉽게 해결되지 않아 애를 먹었습니다.
이번 포스트에서는 단순히 클러스터만 구성했을 뿐 security, load balancing 등 여러 방면에서 개선점이 필요해 보입니다.

## 3.1 Network
엘라스틱서치를 컨테이너 안에서 실행하는 경우 네트워크 설정이 조금 복잡한데 `network.host` 노드간 통신을 위해 `network.publish_host` 를 설정해 주어야 합니다. 

## 3.2 메모리 맵

다음과 같은 에러가 나타나는 경우가 있습니다. 

```
ERROR: [1] bootstrap checks failed
[1]: max virtual memory areas vm.max_map_count [65530] is too low, increase to at least [262144]
```

엘라스틱서치는 기본적으로 메모리 맵 262144 이상부터 구동 가능하도록 제한 되어있습니다.
매모리 맵 수가 65536 으로 되어있는 경우 엘라스틱서치가 실행되지 않고 위의 에러가 발생하는데 max_map_count 값을 수동으로 늘려주어야 합니다.

```bash
$> cat /proc/sys/vm/max_map_count
65536
$> sysctl -w vm.max_map_count=262144
$> sudo sysctl -w vm.max_map_count=262144
```

## 3.3 Security

X-Pack 의 경우 운영 모드에서는 활성화 시키는것이 정석입니다.
또한 운영 모드에서는 transport SSL 도 설정해 주어야 하나 과정이 번거로워 생략하였습니다.
trial 라이선스로 실행하는 경우 운영 모드여도 X-Pack 설정을 회피할 수 있습니다.

---

References
- 
- [Elastic 가이드 북](https://esbook.kimjmin.net/)
- [Elastic 8.0 설치하기](http://kimjmin.net/2022/02/2022-02-elastic-8-install/)
- [https://github.com/deviantony/docker-elk](https://github.com/deviantony/docker-elk)
- [Running the Elastic Stack ("ELK") on Docker](https://www.elastic.co/guide/en/elastic-stack-get-started/current/get-started-stack-docker.html)
- [The RED : 검색엔진 구축을 위한 Elasticsearch 마스터 클래스 by 정호욱](https://fastcampus.co.kr/data_red_jhw)
