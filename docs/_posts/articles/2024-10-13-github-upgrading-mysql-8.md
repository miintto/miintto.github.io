---
layout: post
title: "[번역] GitHub의 MySQL 8.0 업그레이드"
category: articles
tags:
  - github
  - mysql
toc: true
thumbnail: "/img/thumbnails/github-upgrading-mysql-8.png"
---

> 해당 포스트는 GitHub 블로그의 [Upgrading GitHub.com to MySQL 8.0](https://github.blog/engineering/infrastructure/upgrading-github-com-to-mysql-8-0/) 포스트를 번역한 글입니다.
> 
> 게시일: 2023.12.07

# GitHub의 MySQL 8.0 업그레이드

15년 전 GitHub는 Ruby on Rails 어플리케이션과 하나의 MySQL 서버로 단촐하게 출발했습니다.
시간이 흘러 점차 플랫폼이 확장되면서 인프라 요구 사항에 맞추어 [고가용성 구축](https://github.blog/engineering/mysql-high-availability-at-github/), [테스트 자동화](https://github.blog/engineering/mysql-testing-automation-at-github/), [데이터 파티셔닝](https://github.blog/engineering/partitioning-githubs-relational-databases-scale/) 등과 같은 방식으로 MySQL 아키텍처를 발전시켜 왔습니다.
그리고 오늘날 MySQL은 GitHub 데이터베이스 인프라의 핵심 부분으로 자리 잡았습니다.

여기에 우리가 1200개 이상의 MySQL 호스트를 업그레이드한 일대기를 정리해 보았습니다.
서비스 수준 목표(SLO)에 영향을 주지 않으면서 MySQL 서버를 업그레이드하는 건 결코 만만치 않았으며, 내부 여러 팀과 협업하면서 계획을 세우고 검증 및 업그레이드 과정에만 1년 이상의 시간이 소요되었습니다.

## 업그레이드 계기

MySQL 8.0 업그레이드를 진행한 가장 큰 이유는 당시 [MySQL 5.7의 수명 주기가 거짐 끝나가고](https://dev.mysql.com/doc/refman/8.0/en/faqs-general.html) 있었기 때문었습니다.
그래서 바로 다음 메이저 버전인 8.0으로 업그레이드하기로 했습니다.
또한 지속적으로 보안 패치, 버그 픽스 및 성능 향상을 지원받는 버전을 사용하고 싶었고, 8.0 버전에 인스턴트 DDL, invisible 인덱스, 압축 빈 로그 등 우리가 도입하고 싶었던 기능도 포함되어 있었습니다.

## GitHub의 MySQL 인프라 구성

본격적인 데이터베이스 업그레이드로 들어가기에 앞서 우리의 MySQL 인프라 구성에 관해 설명드리겠습니다.

- 저희 MySQL 인프라는 1200개 이상의 호스트로 구성되어 있는데, Azure 서비스와 우리 자체적인 데이터 센터 양쪽에서 운영하고 있습니다.
- 총 300TB 이상의 데이터를 저장하고 있으며, 50여 개의 클러스터에서 매 초마다 550만 개의 쿼리가 실행되고 있습니다.
- 각 클러스터는 하나의 프라이머리(primary)와 여러 레플리카(replica)로 구성하여 [고가용성에 대비](https://github.blog/engineering/mysql-high-availability-at-github/)하였습니다.
- 저장된 데이터는 파티션 설정이 되어있습니다. 수평 및 수직 샤딩을 모두 활용하여 MySQL 클러스터를 확장하였으며, 특정 제품 도메인의 정보를 저장한 클러스터도 있습니다. 또한 단일 MySQL 클러스터 규모 이상의 대규모 도메인 영역에 대해서는 여러 샤드로 분할한 [Vitess](https://vitess.io/) 클러스터도 사용하고 있습니다.
- 이러한 시스템 운영을 위해 Percona Toolkit, [gh-ost](https://github.com/github/gh-ost), [orchestrator](https://github.com/openark/orchestrator), [freno](https://github.com/github/freno) 등과 같은 다양한 도구를 사용하고 있습니다.

요약하자면 위와 같이 까다로운 배포 환경에서도 SLO를 유지하면서 업그레이드를 진행해야 합니다.

## 사전 준비 단계

GitHub는 저명한 데이터 저장소의 명성에 걸맞게 높은 가용성 표준을 고수하고 있습니다.
우리 인프라에서 MySQL이 담당하는 비중이 상당함에 따라 업그레이드 진행간 아래와 같은 요구 사항이 필요했습니다.

- 업그레이드를 진행하는 동안 반드시 서비스 수준 목표(SLO) 및 서비스 수준 계약(SLA)을 준수해야 합니다.
- 테스트 및 검증 단계에서 모든 상황을 다 예측할 수 없으므로 이상이 생긴 경우 SLO를 지키기 위해 서비스 중단 없이 다시 MySQL 5.7로 롤백할 수 있어야 합니다.
- MySQL 클러스터 내부에는 다양한 워크로드가 실행되고 있습니다. 리스크를 줄이기 위해 업그레이드 진행 간 각 클러스터의 원자성을 유지해야 하고, 다른 주요 변경 사항을 고려하여 일정을 조정해야 합니다. 결국 업그레이드 일정이 꽤 길어질 수 있다는 의미이기도 한데, 일정 기간은 두 버전이 혼합되어 운영될 수도 있다는 점도 염두하고 있었습니다.

이러한 업그레이드 준비는 2022년 7월부터 시작하였고 실질적인 운영 데이터베이스 업그레이드를 진행하기 전에 많은 사전 작업이 필요했습니다.

### 인프라 업그레이드 준비

새로 업그레이드되는 MySQL 8.0에 적합한 파라미터 값 설정과 몇 가지 기본 성능 테스트가 필요했습니다.
또한 MySQL 5.7, 8.0 두 가지 버전을 운영해야 했기 때문에 자동화 시스템에서 혼합된 두 버전 사이의 구문의 차이를 인식하여 작업을 처리할 수 있어야 했습니다.

### 어플리케이션 호환성 보장

MySQL을 사용하는 모든 어플리케이션 CI(Continuous Integration) 프로세스에 MySQL 8.0을 추가했습니다.
CI 프로세스에서 두 버전이 동시에 실행되도록 하여 장기간의 업그레이드 동안 성능 하락이 발생하지 않는지 확인하였고, 그 결과 다양한 버그와 호환성 이슈를 미리 파악하여 더 이상 지원하지 않는 기능을 걷어내고 새로운 예약 키워드를 피할 수 있었습니다.

또한 어플리케이션 개발자들이 수월하게 MySQL 8.0으로 전환할 수 있도록 GitHub Codespaces에 MySQL 8.0 컨테이너를 준비하였으며, 추가적인 운영 테스트를 위한 MySQL 클러스터도 제공하였습니다.

### 커뮤니케이션 및 투명성

우리는 GitHub 프로젝트 캘린더를 활용하여 내부적으로 업그레이드 일정을 공유하였습니다.
그리고 이슈 템플릿을 만들어 어플리케이션 팀과 데이터베이스팀 간의 체크 리스트를 꾸준히 확인하였습니다.

<img src="/img/posts/github-upgrading-mysql-8-img001.png" style="max-width:720px"/>
<span class="caption text-muted">MySQL 8.0 업그레이드 진행 상황을 확인하는 프로젝트 보드</span>

## 업그레이드 계획

가용성 표준을 충족하기 위해서 우리는 프로세스에 전반에 걸쳐서 체크 포인트와 롤백이 가능한 업그레이드 전략을 수립하였습니다.

### 1단계: 레플리카 업그레이드

먼저 단일 레플리카 단위로 업그레이드를 시작하였는데 데이터베이스가 안정적으로 작동하는지 확인하기 위해 오프라인 상태일 때부터 모니터링하였습니다.
그리고 운영 트래픽이 유입되면 쿼리 latency, 시스템 및 어플리케이션 지표를 지속적으로 확인했습니다.
이런 방식으로 8.0 레플리카를 순차적으로 활성화하였으며, 전체 데이터 센터의 업그레이드 작업이 완료되면 다음 데이터 센터에서도 동일하게 반복했습니다.
롤백을 위해 5.7 레플리카도 충분히 남겨두었지만, 이내 운영 트래픽을 끊었고 온전히 8.0 서비스를 시작할 수 있었습니다.

<img src="/img/posts/github-upgrading-mysql-8-img002.png" style="max-width:720px"/>
<span class="caption text-muted">각 데이터 센터에서 순차적으로 배포하는 레플리카 업그레이드 전략</span>

### 2단계: 복제 위상 배치 변경

모든 read 트래픽을 8.0 레플리카가 담당하게 되면서 복제 위상 배치를 아래와 같이 조정하였습니다.

- 프라이머리가 될 8.0 호스트를 5.7 프라이머리 바로 아래에서 복제되도록 구성합니다.
- 8.0 레플리카 후속에는 두 개의 복제 체인이 생성됩니다.
- 트래픽은 유입되지 않지만 롤백 상황에 대비한 5.7 레플리카 그룹과,
- 트래픽이 유입되는 8.0 레플리카 그룹으로 두 개의 복제 체인이 구성됩니다.
- 이러한 위상 배치는 다음 단계로 넘어갈 때까지 짧은 시간(최대 몇 시간) 동안만 유지됩니다.

<img src="/img/posts/github-upgrading-mysql-8-img003.png" style="max-width:720px"/>
<span class="caption text-muted">원활한 업그레이드를 위해서 두 개의 복제 체인을 조합한 구성으로 위상 배치를 변경하였습니다.</span>

### 3단계: 8.0 호스트를 프라이머리로 승격

우리는 프라이머리 데이터베이스를 직접 업그레이드하는 방식은 피하려 했습니다.
대신, [Orchestrator](https://github.com/openark/orchestrator)를 활용하여 MySQL 8.0 레플리카 중 하나를 프라이머리로 graceful 하게 교체하는 방식을 택하였습니다.
작업 후 위상 배치는 8.0 프라이머리를 중심으로 롤백에 대비한 5.7 레플리카와 실제로 서비스 중인 8.0 레플리카의 두 개의 복제 체인으로 구성됩니다.

추가적으로 Orchestrator에 예상치 못한 failover가 발생한 경우 5.7 호스트로 롤백되는 것을 방지하기 위해 5.7 레플리카들은 블랙리스트에 올려두었습니다.

<img src="/img/posts/github-upgrading-mysql-8-img004.png" style="max-width:720px"/>
<span class="caption text-muted">MySQL 8.0 업그레이드를 완료하기 위한 프라이머리 failover 및 추가 진행 단계</span>

### 4단계: 내부용 인스턴스 타입 변경

또한 백업이나 비운영 워크로드를 위한 보조 서버도 있었습니다.
해당 데이터베이스도 일관성을 위해 업그레이드를 진행하였습니다.

### 5단계: 정리

그리고 마침내 더 이상 롤백을 진행할 필요 없이 모든 클러스터를 8.0으로 업그레이드하였으며 남아있는 5.7 서버들을 제거하였습니다.
검증 작업은 최소 24시간 사이클을 포함하였으며 최대 트래픽이 유입되더라도 문제가 없는지 확인하였습니다.

## 롤백 대비

업그레이드 전략의 안정성을 보장하기 위한 핵심은 바로 여차하면 이전 MySQL 5.7로 돌아갈 방법을 확보하는 것이었습니다.
레플리카의 경우 충분한 수의 5.7 레플리카를 유지하며 운영 트래픽에 대응하였고, 8.0 레플리카가 생각만큼 성능이 나오지 않으면 레플리카 비활성화 후 롤백이 진행되도록 하였습니다.
그리고 프라이머리의 경우에는 데이터 손실이나 서비스 중단 없이 롤백을 진행하기 위해서 8.0과 5.7 간의 역방향 데이터 복제도 필요했습니다.

MySQL은 하나의 릴리즈에서 다음 버전 릴리즈로의 복제는 가능하지만, 그 반대는 명확하게 제공하지 않고 있었습니다([MySQL 복제 호환성](https://dev.mysql.com/doc/refman/8.0/en/replication-compatibility.html)).
우리는 스테이징 클러스터에서 8.0 프라이머리 교체 테스트를 진행했는데 당시 모든 5.7 레플리카로의 복제가 끊어지는 상황을 발견했습니다.
여기서 우리가 해결해야 할 두 가지 문제가 있었습니다.

1. MySQL 8.0에서는 `utf8mb4`가 기본적인 character set이고, 디폴트 collation으로 `utf8mb4_0900_ai_ci`를 사용하고 있습니다. 하지만 이전 5.7 버전에서는 `utf8mb4_unicode_520_ci` collation은 사용할 수 있지만 최신 유니코드 `utf8mb4_0900_ai_ci`는 지원하지 않고 있었습니다.
2. MySQL 8.0은 [role을 도입](https://dev.mysql.com/doc/refman/8.0/en/roles.html)하여 권한을 관리하고 있지만 이러한 기능이 5.7 버전에는 존재하지 않았습니다. 결국 8.0 인스턴스가 프라이머리가 되는 순간부터 문제점이 발생하였습니다. 권한 관리 구성이 role 기능을 포함하도록 확장되었는데, 이러한 구성 값이 다시 5.7 버전으로 복제되면서 제대로 작동하지 않았습니다. 결국 업그레이드 진행 간 영향을 받는 사용자 권한을 임시로 건드려서 문제를 해결했습니다.

Character set 호환성을 해결하기 위해서는 디폴트 인코딩을 `utf8`으로, collation을 `utf8_unicode_ci`으로 설정값 변경이 필요했습니다.

다행히도 GitHub.com의 모놀리스 구성상 Rails 설정을 통해 collation을 일관되게 유지하고 클라이언트 구성을 데이터베이스로 더 쉽게 표준화할 수 있었습니다.
그래서 우리는 강한 자신감을 가지고 주요한 어플리케이션에 대한 하위 복제를 진행할 수 있었습니다.

## 시행착오

테스트, 사전 준비 및 업그레이드 과정에서 몇 가지 기술적인 과제도 있었는데 아래와 같습니다.

### Vitess 이슈

저희는 관계형 데이터를 수평적으로 샤딩하기 위해 Vitess를 사용하고 있습니다.
그리고 Vitess 클러스터를 업그레이드 하는 건 MySQL을 다루는 것과는 성격이 매우 달랐습니다.
다행히 우리는 CI 프로세스에 Vitess를 포함시켜서 쿼리 호환성에 대해 검증할 수 있었습니다.
샤딩 처리된 클러스터에 대한 전락으로 한 번에 하나의 샤드만 업그레이드를 진행하였습니다.
Vitess의 프록시 계층 VTgate는 MySQL 버전에 의존성이 있으며 일부 클라이언트는 해당 버전에 따라 다르게 동작합니다.
예를 들어 Java 클라이언트를 사용하는 한 어플리케이션은 5.7 서버에 대한 쿼리 캐시를 비활성 했는데, 8.0에서는 쿼리 캐시 기능이 제거되어서 에러가 발생했습니다.
그래서 특정 keyspace에 대해 단일 MySQL 호스트를 업그레이드한 후 VTgate 설정도 8.0으로 바꾸는 방법으로 작업했습니다.

### 복제 지연

우리 시스템은 여러 레플리카를 사용하여 read 작업에 대응하고 있습니다.
그리고 GitHub.com은 항상 최신 데이터를 제공하기 위해 매우 짧은 복제 지연 시간을 가지고 있습니다.

테스트 초기 단계에서 MySQL 복제 버그를 발견하였고 [8.0.28 버전에서 수정되었습니다.](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/news-8-0-28.html#mysqld-8-0-28-bug)

> Replication: 만약 레플리카 서버가 `replica_preserve_commit_order` = 1로 설정되어 장기간 부하를 받게 된다면 해당 시스템에 커밋 순번이 부족해질 수 있습니다. 
> 커밋 수가 최대값을 넘어선 뒤 이상 행동이 발현되어 작업이 중단되었고 워커 스레드가 커밋 대기열에서 무한히 대기하는 상황을 발견했습니다.
> 이제 커밋 순번 제너레이터가 올바르게 작동합니다.
> 도움 주신 Zhai Weixiang님께 감사드립니다. 
> (Bug #32891221, Bug #103636)

정황상 우리는 이 버그가 재현되기 위한 모든 기준을 충족하고 있었습니다.

- 우리는 GTID 기반 복제를 사용했기 때문에  `replica_preserve_commit_order` 값을 설정해 두었습니다.
- 내부 시스템의 다수 클러스터는 긴 시간 동안 집중적으로 부하를 받았습니다. 대부분의 클러스터는 write 작업 집약도가 매우 높습니다.

해당 버그가 수정되어 릴리즈되었기 때문에 우리가 업그레이드하는 MySQL 버전이 8.0.28 이상인지 다시 한번 확인했습니다. 

또한 MySQL 8.0에서 복제 시간을 지연시키는 일부 무거운 write 작업도 발견했습니다.
따라서 쓰기 작업이 크게 증폭되지 않도록 하는 것이 더욱 중요해졌습니다.
GitHub에서는 [freno](https://github.com/github/freno)를 사용하여 이러한 복제 지연 관련 워크로드를 조절하고 있습니다.

### CI는 통과했지만 운영에서 실패하는 쿼리

우리는 운영 환경에서 필연적으로 문제가 발생할 수 있다는 사실을 염두에 뒀기 때문에 레플리카를 순차적으로 업그레이드하는 방식으로 배포 전략을 수립했습니다.
그리고 예상했듯이 CI는 통과했지만 운영 워크로드에서는 실행되지 않는 쿼리를 발견했습니다.
문제가 되었던 점은 바로 과도한 `WHERE IN` 구문이었는데, `WHERE IN` 내부에 수만 개 이상의 값이 포함된 무거운 쿼리가 실행되고 있었습니다.
이러한 경우 업그레이드 진행에 앞서 쿼리 수정이 필요했습니다.
쿼리 샘플링은 이런 문제를 감지하는 데 큰 도움이 되며, GitHub 내부에서는 SaaS 데이터베이스 성능 모니터 [Solarwinds DPM(VividCortex)](https://www.solarwinds.com/database-performance-monitor)을 활용하여 쿼리를 주시하고 있습니다.

## 학습 및 시사점

테스트와 성능 튜닝을 진행하며 포착된 이슈를 처리하기까지 전체 업그레이드 프로세스에 1년이라는 시간이 소요되었고, 내부 여러 팀의 엔지니어가 참여하였습니다.
그리고 우리는 스테이징 및 운영 클러스터를 포함한 GitHub.com 전체 MySQL 데이터베이스를 8.0으로 업그레이드하였습니다.
이러한 업그레이드를 진행하며 플랫폼 주시, 검증 계획, 롤백 가능성에 대한 중요성이 강조되었습니다.
또한 사전 검증과 순차적인 배포 전략으로 조기에 문제를 파악하여 프라이머리 업그레이드 단계에서는 더 이상 새로운 이슈가 발생할 가능성을 낮추어주었습니다.

배포 전략과는 별개로 항상 롤백에 대한 가능성을 열어두었으며 매 단계마다 롤백이 필요한 상황인지 알아차려야만 했습니다.
롤백 작업 중 가장 애를 먹었던 부분은 새롭게 선정된 8.0 프라이머리에서 5.7 레플리카로 역방향 복제를 유지하는 것이었습니다.
다행히도 [Trilogy 라이브러리](https://github.com/trilogy-libraries/trilogy)의 일관성 덕분에 연결 동작을 예측할 수 있었고 Rails 모놀리스 연결이 역방향 복제를 방해하지 않을 것이라는 확신을 주었습니다.

하지만 서로 다른 언어와 프레임워크를 사용하는 여러 클라이언트와 연결된 일부 MySQL 클러스터에서는 역방향 복제가 몇 시간 만에 중단되어 롤백 기회가 짧아졌습니다.
다행히도 이러한 경우는 거의 발생하지 않았고 롤백을 시도하기 전에 복제가 중단된 사례는 없었습니다.
그래도 우리는 클라이언트 측의 연결 구성을 잘 활용하면 쏠쏠한 이점이 있다는 교훈을 얻었으며, 이러한 구성의 일관성을 유지하기 위한 가이드라인과 프레임워크 개발의 중요성을 깨달았습니다.

또한 [데이터를 파티션 처리](https://github.blog/engineering/partitioning-githubs-relational-databases-scale/)했던 이전의 노력 덕분에 다양한 도메인의 데이터를 필요한 부분만 업그레이드할 수 있었습니다.
실패한 하나의 쿼리로 전체 클러스터의 업그레이드가 중단될 수 있었기 때문에 파티션 처리는 중요했는데, 분할된 워크로드 덕분에 부분적인 업그레이드가 가능했으며 이러한 과정에서 예상치 못한 리스크가 발생하더라도 그 영향 범위를 줄일 수 있었습니다.
이러한 변화는 MySQL 인프라가 한층 더 성장했다는 의미이기도 합니다.

지난번 MySQL 버전 업그레이드를 진행할 때는 5개의 클러스터에 불과했지만, 현재는 50개 이상의 클러스터로 늘어났습니다.
이러한 상황에서 업그레이드를 성공적으로 마무리하기 위해 시스템 관측, 소프트웨어 도구, 인프라 관리 프로세스에 대한 투자가 필요했습니다.

## 결론

어떻게 보면 MySQL 업그레이드는 우리가 수행해야 하는 일상적인 유지보수에 불과하지만, 우리 시스템에서 돌아가는 모든 소프트웨어에 대한 업그레이드를 확보하는 건 매우 중요합니다.
이번 프로젝트의 일환으로 우리는 MySQL 버전 업그레이드를 성공적으로 완수하기 위한 새로운 프로세스와 운영 기능을 만들어두었습니다.
물론 프로세스 중에 별도 수기 처리가 필요한 단계가 여전히 너무 많있지만 다음에 진행될 MySQL 업그레이드에서는 우리의 노력과 시간이 좀 더 절약되기를 바랍니다.

우리는 GitHub.com이 성장함에 따라 우리 인프라도 발전할 것으로 기대하며, 동시에 지속적으로 데이터 파티션 처리를 진행하여 MySQL 클러스터가 더 늘어나는 것을 목표로 하고 있습니다.
또한 운영 작업 및 자가 치유 기능을 포함한 자동화 시스템을 구축하면 추후 MySQL 운영 규모를 확장하는 데 도움을 줄 것으로 예상합니다.
우리는 신뢰성 있는 인프라 운영과 자동화에 투자하는 것이 GitHub를 확장하고 필요한 유지보수를 지속적으로 수행하며 더 예측 가능하고 탄력적인 시스템을 제공할 것이라고 믿습니다.

이번 프로젝트의 교훈으로 MySQL 자동화의 기반을 마련하였으며 향후 업그레이드가 더 효율적으로 이루어질 수 있는 길을 닦으면서도 동일한 수준의 주의와 안전을 유지할 것입니다.

---

# Upgrading GitHub.com to MySQL 8.0

Over 15 years ago, GitHub started as a Ruby on Rails application with a single MySQL database.
Since then, GitHub has evolved its MySQL architecture to meet the scaling and resiliency needs of the platform—including [building for high availability](https://github.blog/engineering/mysql-high-availability-at-github/), [implementing testing automation](https://github.blog/engineering/mysql-testing-automation-at-github/), and [partitioning the data](https://github.blog/engineering/partitioning-githubs-relational-databases-scale/).
Today, MySQL remains a core part of GitHub’s infrastructure and our relational database of choice.

This is the story of how we upgraded our fleet of 1200+ MySQL hosts to 8.0.
Upgrading the fleet with no impact to our Service Level Objectives (SLO) was no small feat–planning, testing and the upgrade itself took over a year and collaboration across multiple teams within GitHub.

## Motivation for upgrading

Why upgrade to MySQL 8.0?
With [MySQL 5.7 nearing end of life](https://dev.mysql.com/doc/refman/8.0/en/faqs-general.html), we upgraded our fleet to the next major version, MySQL 8.0.
We also wanted to be on a version of MySQL that gets the latest security patches, bug fixes, and performance enhancements.
There are also new features in 8.0 that we want to test and benefit from, including Instant DDLs, invisible indexes, and compressed bin logs, among others.

## GitHub’s MySQL infrastructure

Before we dive into how we did the upgrade, let’s take a 10,000-foot view of our MySQL infrastructure:

- Our fleet consists of 1200+ hosts. It’s a combination of Azure Virtual Machines and bare metal hosts in our data center.
- We store 300+ TB of data and serve 5.5 million queries per second across 50+ database clusters.
- Each cluster is [configured for high availability](https://github.blog/engineering/mysql-high-availability-at-github/) with a primary plus replicas cluster setup.
- Our data is partitioned. We leverage both horizontal and vertical sharding to scale our MySQL clusters. We have MySQL clusters that store data for specific product-domain areas. We also have horizontally sharded [Vitess](https://vitess.io/) clusters for large-domain areas that outgrew the single-primary MySQL cluster.
- We have a large ecosystem of tools consisting of Percona Toolkit, [gh-ost](https://github.com/github/gh-ost), [orchestrator](https://github.com/openark/orchestrator), [freno](https://github.com/github/freno), and in-house automation used to operate the fleet.

All this sums up to a diverse and complex deployment that needs to be upgraded while maintaining our SLOs.

## Preparing the journey

As the primary data store for GitHub, we hold ourselves to a high standard for availability.
Due to the size of our fleet and the criticality of MySQL infrastructure, we had a few requirements for the upgrade process:

- We must be able to upgrade each MySQL database while adhering to our Service Level Objectives (SLOs) and Service Level Agreements (SLAs).
- We are unable to account for all failure modes in our testing and validation stages. So, in order to remain within SLO, we needed to be able to roll back to the prior version of MySQL 5.7 without a disruption of service.
- We have a very diverse workload across our MySQL fleet. To reduce risk, we needed to upgrade each database cluster atomically and schedule around other major changes. This meant the upgrade process would be a long one. Therefore, we knew from the start we needed to be able to sustain operating a mixed-version environment.

Preparation for the upgrade started in July 2022 and we had several milestones to reach even before upgrading a single production database.

### Prepare infrastructure for upgrade

We needed to determine appropriate default values for MySQL 8.0 and perform some baseline performance benchmarking.
Since we needed to operate two versions of MySQL, our tooling and automation needed to be able to handle mixed versions and be aware of new, different, or deprecated syntax between 5.7 and 8.0.

### Ensure application compatibility

We added MySQL 8.0 to Continuous Integration (CI) for all applications using MySQL.
We ran MySQL 5.7 and 8.0 side-by-side in CI to ensure that there wouldn’t be regressions during the prolonged upgrade process.
We detected a variety of bugs and incompatibilities in CI, helping us remove any unsupported configurations or features and escape any new reserved keywords.

To help application developers transition towards MySQL 8.0, we also enabled an option to select a MySQL 8.0 prebuilt container in GitHub Codespaces for debugging and provided MySQL 8.0 development clusters for additional pre-prod testing.

### Communication and transparency

We used GitHub Projects to create a rolling calendar to communicate and track our upgrade schedule internally.
We created issue templates that tracked the checklist for both application teams and the database team to coordinate an upgrade.

<img src="/img/posts/github-upgrading-mysql-8-img001.png" style="max-width:720px"/>
<span class="caption text-muted">Project Board for tracking the MySQL 8.0 upgrade schedule</span>

## Upgrade plan
To meet our availability standards, we had a gradual upgrade strategy that allowed for checkpoints and rollbacks throughout the process.

### Step 1: Rolling replica upgrades

We started with upgrading a single replica and monitoring while it was still offline to ensure basic functionality was stable.
Then, we enabled production traffic and continued to monitor for query latency, system metrics, and application metrics.
We gradually brought 8.0 replicas online until we upgraded an entire data center and then iterated through other data centers.
We left enough 5.7 replicas online in order to rollback, but we disabled production traffic to start serving all read traffic through 8.0 servers.

<img src="/img/posts/github-upgrading-mysql-8-img002.png" style="max-width:720px"/>
<span class="caption text-muted">The replica upgrade strategy involved gradual rollouts in each data center (DC).</span>

### Step 2: Update replication topology

Once all the read-only traffic was being served via 8.0 replicas, we adjusted the replication topology as follows:

- An 8.0 primary candidate was configured to replicate directly under the current 5.7 primary.
- Two replication chains were created downstream of that 8.0 replica:
- A set of only 5.7 replicas (not serving traffic, but ready in case of rollback).
- A set of only 8.0 replicas (serving traffic).
- The topology was only in this state for a short period of time (hours at most) until we moved to the next step.

<img src="/img/posts/github-upgrading-mysql-8-img003.png" style="max-width:720px"/>
<span class="caption text-muted">To facilitate the upgrade, the topology was updated to have two replication chains.</span>

### Step 3: Promote MySQL 8.0 host to primary

We opted not to do direct upgrades on the primary database host.
Instead, we would promote a MySQL 8.0 replica to primary through a graceful failover performed with [Orchestrator](https://github.com/openark/orchestrator).
At that point, the replication topology consisted of an 8.0 primary with two replication chains attached to it: an offline set of 5.7 replicas in case of rollback and a serving set of 8.0 replicas.

Orchestrator was also configured to blacklist 5.7 hosts as potential failover candidates to prevent an accidental rollback in case of an unplanned failover.

<img src="/img/posts/github-upgrading-mysql-8-img004.png" style="max-width:720px"/>
<span class="caption text-muted">Primary failover and additional steps to finalize MySQL 8.0 upgrade for a database</span>

### Step 4: Internal facing instance types upgraded

We also have ancillary servers for backups or non-production workloads.
Those were subsequently upgraded for consistency.

### Step 5: Cleanup

Once we confirmed that the cluster didn’t need to rollback and was successfully upgraded to 8.0, we removed the 5.7 servers.
Validation consisted of at least one complete 24 hour traffic cycle to ensure there were no issues during peak traffic.

## Ability to Rollback

A core part of keeping our upgrade strategy safe was maintaining the ability to rollback to the prior version of MySQL 5.7.
For read-replicas, we ensured enough 5.7 replicas remained online to serve production traffic load, and rollback was initiated by disabling the 8.0 replicas if they weren’t performing well.
For the primary, in order to roll back without data loss or service disruption, we needed to be able to maintain backwards data replication between 8.0 and 5.7.

MySQL supports replication from one release to the next higher release but does not explicitly support the reverse ([MySQL Replication compatibility](https://dev.mysql.com/doc/refman/8.0/en/replication-compatibility.html)). When we tested promoting an 8.0 host to primary on our staging cluster, we saw replication break on all 5.7 replicas. There were a couple of problems we needed to overcome:

1. In MySQL 8.0, `utf8mb4` is the default character set and uses a more modern `utf8mb4_0900_ai_ci` collation as the default. The prior version of MySQL 5.7 supported the `utf8mb4_unicode_520_ci` collation but not the latest version of Unicode `utf8mb4_0900_ai_ci`.
2. MySQL 8.0 [introduces roles](https://dev.mysql.com/doc/refman/8.0/en/roles.html) for managing privileges but this feature did not exist in MySQL 5.7. When an 8.0 instance was promoted to be a primary in a cluster, we encountered problems. Our configuration management was expanding certain permission sets to include role statements and executing them, which broke downstream replication in 5.7 replicas. We solved this problem by temporarily adjusting defined permissions for affected users during the upgrade window.

To address the character collation incompatibility, we had to set the default character encoding to `utf8` and collation to `utf8_unicode_ci`.

For the GitHub.com monolith, our Rails configuration ensured that character collation was consistent and made it easier to standardize client configurations to the database.
As a result, we had high confidence that we could maintain backward replication for our most critical applications.

## Challenges

Throughout our testing, preparation and upgrades, we encountered some technical challenges.

### What about Vitess?

We use Vitess for horizontally sharding relational data.
For the most part, upgrading our Vitess clusters was not too different from upgrading the MySQL clusters.
We were already running Vitess in CI, so we were able to validate query compatibility.
In our upgrade strategy for sharded clusters, we upgraded one shard at a time.
VTgate, the Vitess proxy layer, advertises the version of MySQL and some client behavior depends on this version information.
For example, one application used a Java client that disabled the query cache for 5.7 servers—since the query cache was removed in 8.0, it generated blocking errors for them.
So, once a single MySQL host was upgraded for a given keyspace, we had to make sure we also updated the VTgate setting to advertise 8.0.

### Replication delay

We use read-replicas to scale our read availability.
GitHub.com requires low replication delay in order to serve up-to-date data.

Earlier on in our testing, we encountered a replication bug in MySQL that was [patched on 8.0.28](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/news-8-0-28.html#mysqld-8-0-28-bug):

> Replication: If a replica server with the system variable `replica_preserve_commit_order` = 1 set was used under intensive load for a long period, the instance could run out of commit order sequence tickets.
> Incorrect behavior after the maximum value was exceeded caused the applier to hang and the applier worker threads to wait indefinitely on the commit order queue.
> The commit order sequence ticket generator now wraps around correctly.
> Thanks to Zhai Weixiang for the contribution.
> (Bug #32891221, Bug #103636)

We happen to meet all the criteria for hitting this bug.

- We use `replica_preserve_commit_order` because we use GTID based replication.
- We have intensive load for long periods of time on many of our clusters and certainly for all of our most critical ones. Most of our clusters are very write-heavy.

Since this bug was already patched upstream, we just needed to ensure we are deploying a version of MySQL higher than 8.0.28.

We also observed that the heavy writes that drove replication delay were exacerbated in MySQL 8.0.
This made it even more important that we avoid heavy bursts in writes.
At GitHub, we use [freno](https://github.com/github/freno) to throttle write workloads based on replication lag.

### Queries would pass CI but fail on production

We knew we would inevitably see problems for the first time in production environments—hence our gradual rollout strategy with upgrading replicas.
We encountered queries that passed CI but would fail on production when encountering real-world workloads.
Most notably, we encountered a problem where queries with large `WHERE IN` clauses would crash MySQL.
We had large `WHERE IN` queries containing over tens of thousands of values.
In those cases, we needed to rewrite the queries prior to continuing the upgrade process.
Query sampling helped to track and detect these problems.
At GitHub, we use [Solarwinds DPM (VividCortex)](https://www.solarwinds.com/database-performance-monitor), a SaaS database performance monitor, for query observability.

## Learnings and takeaways

Between testing, performance tuning, and resolving identified issues, the overall upgrade process took over a year and involved engineers from multiple teams at GitHub.
We upgraded our entire fleet to MySQL 8.0 – including staging clusters, production clusters in support of GitHub.com, and instances in support of internal tools.
This upgrade highlighted the importance of our observability platform, testing plan, and rollback capabilities.
The testing and gradual rollout strategy allowed us to identify problems early and reduce the likelihood for encountering new failure modes for the primary upgrade.

While there was a gradual rollout strategy, we still needed the ability to rollback at every step and we needed the observability to identify signals to indicate when a rollback was needed.
The most challenging aspect of enabling rollbacks was holding onto the backward replication from the new 8.0 primary to 5.7 replicas.
We learned that consistency in the [Trilogy client library](https://github.com/trilogy-libraries/trilogy) gave us more predictability in connection behavior and allowed us to have confidence that connections from the main Rails monolith would not break backward replication.

However, for some of our MySQL clusters with connections from multiple different clients in different frameworks/languages, we saw backwards replication break in a matter of hours which shortened the window of opportunity for rollback.
Luckily, those cases were few and we didn’t have an instance where the replication broke before we needed to rollback.
But for us this was a lesson that there are benefits to having known and well-understood client-side connection configurations.
It emphasized the value of developing guidelines and frameworks to ensure consistency in such configurations.

Prior efforts to [partition our data](https://github.blog/engineering/partitioning-githubs-relational-databases-scale/) paid off—it allowed us to have more targeted upgrades for the different data domains.
This was important as one failing query would block the upgrade for an entire cluster and having different workloads partitioned allowed us to upgrade piecemeal and reduce the blast radius of unknown risks encountered during the process.
The tradeoff here is that this also means that our MySQL fleet has grown.

The last time GitHub upgraded MySQL versions, we had five database clusters and now we have 50+ clusters.
In order to successfully upgrade, we had to invest in observability, tooling, and processes for managing the fleet.

## Conclusion

A MySQL upgrade is just one type of routine maintenance that we have to perform – it’s critical for us to have an upgrade path for any software we run on our fleet.
As part of the upgrade project, we developed new processes and operational capabilities to successfully complete the MySQL version upgrade.
Yet, we still had too many steps in the upgrade process that required manual intervention and we want to reduce the effort and time it takes to complete future MySQL upgrades.

We anticipate that our fleet will continue to grow as GitHub.com grows and we have goals to partition our data further which will increase our number of MySQL clusters over time. Building in automation for operational tasks and self-healing capabilities can help us scale MySQL operations in the future.
We believe that investing in reliable fleet management and automation will allow us to scale github and keep up with required maintenance, providing a more predictable and resilient system.

The lessons from this project provided the foundations for our MySQL automation and will pave the way for future upgrades to be done more efficiently, but still with the same level of care and safety.

---

References

- [Upgrading GitHub.com to MySQL 8.0 - The GitHub Blog](https://github.blog/engineering/infrastructure/upgrading-github-com-to-mysql-8-0/)
