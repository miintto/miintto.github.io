---
layout: post
title: "[번역] Facebook의 MySQL 8.0 마이그레이션"
category: meta engineering
tags:
  - meta
  - facebook
  - mysql
  - myrocks
toc: true
thumbnail: "/img/thumbnails/meta-migrating-mysql-8.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Migrating Facebook to MySQL 8.0](https://engineering.fb.com/2021/07/22/data-infrastructure/mysql/) 포스트를 번역한 글입니다.
> 
> 게시일: 2021.07.02

# 페이스북의 MySQL 8.0 마이그레이션

오라클 기업이 관리하는 오픈소스 데이터베이스 [MySQL](https://github.com/facebook/mysql-5.6)은 페이스북에서 중요한 워크로드를 담당하고 있습니다.
그리고 우리는 새로운 요구 사항에 맞추기 위해 새로운 기능을 적극적으로 MySQL에 추가하고 있습니다.
이번 작업으로 클라이언트 커넥션, 스토리지 엔진, 옵티마이저, 복제 등 MySQL 여러 영역에 걸쳐 변화가 일어났습니다.
MySQL의 각 버전마다 워크로드를 마이그레이션하는 과정에서 상당히 많은 신경을 써야 하는데, 필요한 과제는 아래와 같습니다.

- 커스텀 기능을 새로운 버전에 맞게 이전
- 주요 버전 간 복제가 호환되는지 검증
- 기존 어플리케이션 쿼리의 변동 사항 최소화
- 서버 워크로드에 영향을 주는 성능 저하 대응

지난번 메이저 버전 5.6으로 업그레이드를 진행하였을 때 1년 이상의 시간이 소요되었습니다.
그리고 5.7 버전이 릴리즈되었을 때에는 5.6 버전 기반의 LST-Tree 스토리지 엔진 [MyRocks](https://engineering.fb.com/2016/08/31/core-infra/myrocks-a-space-and-write-optimized-mysql-database/) 개발에 집중하고 있었습니다.
5.7 버전 업그레이드까지 동시에 진행하게 되면 스토리지 엔진 개발 일정이 늦어질 것 같아서 우선 MyRocks 개발이 완료될 때까지 5.6 버전을 유지하기로 했습니다.
그리고 우리 데이터베이스(UDB) 서비스 계층에 MyRocks 배포를 마무리하고 나니 MySQL 8.0 버전이 릴리즈되었습니다.

새로운 8.0 버전에는 writeset 병렬 복제, 트랜잭셔녈 데이터 딕셔너리, Atomic DDL 지원과 같은 매력적인 기능이 포함되어 있습니다.
또한 Document Store와 같이 5.7 버전을 건너뛰며 놓친 기능도 가져올 수 있습니다.
현재 5.6 버전은 수명 주기가 끝나가고 있었고 우리는 계속 MySQL 커뮤니티에서 활동하고 싶었습니다.
8.0 버전에 추가된 Instant DDL과 같은 기능으로 MyRocks 스키마 변화 속도를 높일 수 있지만 그러기 위해서는 8.0 코드베이스 기반 실행이 필요합니다.
여러 상황을 보아 코드 업데이트가 가져올 혜택을 종합하여 우리는 8.0 마이그레이션을 진행하기로 결졍했습니다.
이제부터 우리가 8.0 마이그레이션 프로젝트를 진행하며 역경을 이겨낸 과정과 그 과정에서 발견하게 된 놀라운 사실을 공유하려고 합니다.
우리는 처음 이 프로젝트를 검토했을 때부터 이전에 진행했던 5.6 버전 혹은 MyRocks 마이그레이션 작업보다 더 어려울 거라고 예상했습니다.

- 해당 시점에 5.6 브랜치에는 8.0 마이그레이션을 위한 1,700개 이상의 코드 패치가 있었습니다. 또한 이러한 코드 변경 사항을 빈양하는 동안 새로운 기능과 수정 사항이 5.6 코드베이스에 계속 추가되어서 목표 지점이 자꾸만 멀어졌습니다. 
- 우리는 운영 환경에 수많은 MySQL 서버를 보유하고 있으며 다양한 어플리케이션이 실행되고 있습니다. 또한 이러한 MySQL 인스턴스를 운영하기 위해 광범위한 인프라도 가지고 있었는데, 해당 어플리케이션은 통계 정보 수집 및 서버 백업 관리과 같은 작업을 담당합니다.
- 5.6 버전에서 8.0으로 업그레이드하면서 5.7 버전을 건너뛰었습니다. 5.6 버전에서는 잘 작동하던 API가 5.7에서 deprecated 되고 8.0에서는 아예 삭제될 수도 있으므로, 결국 해당 API를 사용하는 어플리케이션까지 건드리게 될 수 있습니다.
- 페이스북 내부의 많은 기능은 8.0과 상위 호환을 고려하지 않아서 마이그레이션 노선 정리가 필요했습니다.
- MyRocks를 8.0에서 실행하기 위해서는 네이티브 파티셔닝, 크래시 리커버리와 같은 내부 개선이 선행되어야 합니다.

## 코드 패치

우선 내부 개발 환경에서 테스트를 위한 8.0 브랜치를 새로 만들었으며, 그렇게 5.6 브랜치에서 8.0으로 전환을 위한 패치 지옥이 시작되었습니다.
처음 시작할 때는 약 1,700개 이상의 패치가 있었는데 몇 가지 주요 카테고리로 정리할 수 있었습니다.
대부분 코드에는 가독성 좋은 코멘트와 설명이 달려있어서 해당 부분이 필요한지 혹은 걷어내도 되는지 구별할 수 있었습니다.
또한 특별한 키워드나 독특한 변수명으로 작성된 기능들도 전체 코드베이스에서 검색하면 쉽게 사용 사례를 찾을 수 있었기 때문에 수월하게 판단할 수 있었습니다.
다만 일부 기능들은 다소 애매모호했는데, 예전 디자인 문서나 게시물 혹은 코드 리뷰 코멘트를 샅샅이 뒤지고 나서야 그 내용을 이해할 수 있었습니다.

각 패치를 정리한 결과 아래 4개 카테고리로 분류할 수 있었습니다.

1. 제거: 더 이상 사용하지 않는 기능, 혹은 8.0 버전에서 이미 제공하고 있어서 옮길 필요가 없는 기능
2. 빌드/클라이언트 관련: 빌드 환경을 지원하거나 mysqlbinlog 같은 MySQL 도구를 조정하거나 비동기 클라이언트 API같이 서버와 관련 없는 기능
3. 비 MyRocks 서버 관련: MyRocks 스토리지 엔진과는 관련 없는 mysqld 서버의 기능
4. MyRocks 서버 관련: MyRocks 스토리지 엔진을 지원하는 기능

우리는 스프레드시트를 사용하여 각 패치의 전환 상태와 히스토리를 관리하였으며, 제거하는 경우 그 사유를 기록해 두었습니다.
그리고 동일한 기능을 다루는 여러 패치는 하나로 묶었습니다.
패치가 8.0 브랜치에 커밋되면 5.6 버전의 커밋 정보를 주석으로 달아두었는데, 많은 패치를 처리하면서 불가피하게 발생한 상태 불일치 이슈를 해결하는데 이러한 기록이 조금이나마 도움이 되었습니다.

클라이언트와 서버 카테고리는 자연스럽게 릴리즈 절차가 되었습니다.
모든 클라이언트 관련 변경 사항을 반영하여 클라이언트 도구와 커넥션 코드를 8.0 버전으로 업데이트할 수 있었습니다.
또한 모든 비 MyRocks 서버 관련 기능을 반영하고 나서 InnoDB 서버에 8.0 버전을 배포할 수 있었습니다.
그리고 MyRocks 서버 기능까지 완료하여 MyRocks를 업데이트할 수 있었습니다.

골치 아팠던 부분으로 일부 기능은 8.0에 맞추기 위해 상당히 많은 변경이 필요했으며 몇몇 부분에서는 호환성 문제가 발생했습니다.
예를 들어 8.0 binlog 이벤트 포맷은 커스텀한 5.6 기능과 호환이 되지 않았습니다.
또한 페이스북이 사용하는 5.6 버전의 커스텀 에러 코드는 8.0 버전에서 새로 추가된 코드와 충돌했습니다.
결국 8.0 서버와 호환되도록 5.6 서버를 패치해야 했습니다.

이렇게 모든 기능을 전환하는 데 몇 년이 걸렸습니다.
막바지까지 2,300여개의 패치를 살펴보았고 그중 약 1,500개의 패치를 반영하였습니다.

## 마이그레이션 절차

우리는 여러 mysqld 인스턴스를 하나의 레플리카 그룹으로 묶어 구성하고 있습니다.
레플리카 그룹의 각 인스턴스는 동일한 데이터를 담고 있지만 데이터 가용성이나 failover를 위해 다른 지역에 위치한 데이터 센터에 분산되어 있습니다.
각 레플리카 그룹마다 하나의 프라이머리(primary) 인스턴스가 있으며 나머지 세컨더리(secondary)는 모두 보조 역할을 수행합니다.
프라이머리는 모든 write 작업을 처리하며 해당 결과를 나머지 세컨더리로 복제합니다.

우리는 5.6 프라이머리/5.6 세컨더리에서 8.0 프라이머리/8.0 세컨더리로 향하는 게 최종 목표입니다.
먼저 [UDB MyRocks 마이그레이션 전략](https://engineering.fb.com/2017/09/25/core-infra/migrating-a-database-from-innodb-to-myrocks/)과 비슷한 계획을 세웠습니다.

1. 각 레플리카 그룹마다 8.0 세컨더리를 추가하고 mysqldump를 활용하여 복제가 진행되도록 합니다. 해당 세컨더리들은 아직 read 트래픽을 받고 있지 않은 상태입니다.
2. 8.0 세컨더리에 read 트래픽 유입을 시작합니다.
3. 8.0 세컨더리 중 하나를 프라이머리로 선정합니다.
4. 5.6 인스턴스에 유입되는 read 트래픽을 중단합니다.
5. 모든 5.6 인스턴스를 제거합니다.

각 레플리카 그룹은 독립적으로 위 절차를 진행하게 되며 필요한 만큼 특정 단계에 머물 수도 있습니다.
우리는 레플리카 그룹을 다시 더 작은 그룹으로 쪼개어 각 과정을 거치도록 했습니다.
그리고 만약 문제가 발생한다면 이전 단계로 되돌릴 수도 있습니다.
일부 레플리카 그룹은 다른 그룹이 작업을 시작하기도 전에 마지막 단계에 도달하기도 했습니다.

이러한 작업을 자동화하여 수많은 레플리카 그룹에 대해 적용하기 위해 새로운 인프라를 구축하였습니다.
간단히 구성 파일의 라인 하나만 변경하는 것만으로 레플리카 그룹을 한데 묶어서 각 단계로 진행시킬 수 있었습니다.
또한 작업 중 문제가 발생한 레플리카 그룹에 대해서는 개별적으로 롤백을 진행할 수 있었습니다.

### Row 기반 복제

8.0 마이그레이션 전략 중 하나로 row 기반 복제(RBR)를 표준으로 잡았습니다.
일부 8.0 기능은 어차피 RBR이 필요했고, 덕분에 MyRocks 전환 작업도 수월해졌습니다.
하지만 대부분 MySQL 레플리카 그룹이 이미 RBR를 사용하고 있던 반면, 일부 statement 기반 복제(SBR)를 사용하는 서버를 건드리는 건 쉽지 않았습니다.
그리고 보통 이러한 레플리카 그룹은 높은 카디널리티 키가 없는 테이블을 보유하고 있었습니다.
RBR로 완전히 교체하는 걸 목표로 삼았지만, 프라이머리 키를 추가하는데 소요되는 긴 작업 시간 때문에 프로젝트에서 후순위로 밀려나게 되었습니다.

그래서 우리는 RBR도 8.0의 필수 요구 사항으로 만들었습니다.
모든 테이블에 프라이머리 키를 추가하였고, 올해에 마지막으로 남은 SBR 레플리카 그룹을 RBR로 교체하였습니다.
RBR 덕분에 일부 레플리카 그룹을 8.0 프라이머리로 옮기는 중 발생한 어플리케이션 이슈를 해결할 수 있었는데, 해당 내용은 후술하겠습니다.

## 자동화 검증

대부분 8.0 마이그레이션 과정은 자동화 시스템과 어플리케이션 쿼리에 대한 테스트 및 검증 단계를 포함하고 있었습니다.

페이스북의 MySQL 인프라가 성장하면서 해당 서버를 운영하는 자동화 시스템도 발전했습니다.
모든 MySQL 자동화 과정이 8.0에서도 호환되도록 보장하기 위해 우리는 테스트 환경을 구축하였고 검증용 레플리카 그룹을 가상 머신에서 실행하며 동작을 검증했습니다.
또한 5.6 버전과 8.0 버전에서 실행될 자동화 기능을 확인하기 위해 카나리 테스트 시나리오를 작성하였으며 그 정확성을 입증했습니다.
결국 그 과정에서 사소한 버그와 이상 행동을 발견했습니다.

8.0 서버에서 MySQL 인프라 각 부분이 검증되는 동안 여러 가지 흥미로운 문제를 발견했고 수정(또는 해결)하였습니다.

1. 에러 로그, mysqldump 출력값, 혹은 서버 커맨드에서 텍스트를 파싱하는 프로그램이 자주 고장 났습니다. 서버 출력값을 살짝만 건드려도 구문 분석 로직에 버그가 발생했습니다.
2. 8.0 버전은 기본 collation이 `utf8mb4`로 설정되어 5.6, 8.0 버전 간의 collation 불일치가 발생했습니다. 8.0 테이블에서는 `utf8mb4_general_ci` collation을 사용하는 5.6 스키마가 collation을 명시적으로 지정하지 않기 때문에 show create table 구문으로 생성하는 경우 `utf8mb4_0900` collation을 사용할 수 있습니다. 이러한 테이 블간의 차이로 인해 때때로 복제 및 스키마 검증 도구에 문제가 발생했습니다.
3. 복제 실패에 대한 에러 코드가 변경되었으며 이에 따라 자동화 시스템이 해당 코드를 올바르게 인식하도록 수정이 필요했습니다.
4. 8.0 버전의 데이터 딕셔너리는 테이블 .frm 파일을 폐기하였지만 일부 자동화 시스템에서는 테이블 스키마 수정 사항을 감지하는데 해당 파일을 계속 사용했습니다.
5. 또한 우리는 8.0에 도입된 동적 권한 기능을 지원하기 위해 자동화를 업데이트해야 했습니다.

### 어플리케이션 검증

우리는 가능한 한 깔끔하게 어플리케이션을 전환하길 바랬지만, 일부 어플리케이션 쿼리가 8.0에서 성능 저하가 발생하거나 실패하는 사례가 나타났습니다.

MyRocks 마이그레이션을 위해 운영 트래픽을 받아서 테스트 인스턴스로 반복 실행하는 MySQL 검증 프레임워크를 구축하였습니다.
또한 각 어플리케이션의 워크로드를 검증하기 위해서 8.0 테스트 인스턴스를 생성하여 쿼리를 반복 실행했습니다.
그리고 테스트 과정에서 8.0 서버로부터 발생하는 에러 로그를 확인하며 몇몇 문제점을 발견했습니다.
불행히도 테스트 과정에서 모든 문제가 해결된 것은 아니었습니다.
예를 들어 마이그레이션 도중 어플리케이션 트랜잭션 내에서 데드락이 발생했는데, 이러한 문제에 대해 해결 방안을 찾을 때까지 5.6 버전으로 롤백해 두었습니다.

- 8.0에 새로운 예약 키워드가 도입되었으며, 그 중 groups, rank와 같은 키워드는 이미 테이블 컬럼 명이나 어플리케이션 쿼리의 alias로 사용하고 있었습니다. 이러한 쿼리 구문은 백쿼트(`)로는 해결할 수 없었고 결국 파싱 에러가 발생했습니다. 살펴보니 어플리케이션에서는 자동으로 쿼리의 컬럼 명을 처리하는 라이브러리를 포함하고 있었는데 해당 라이브러리를 사용하지 않는 어플리케이션에서만 이슈가 발생했습니다. 해결 방안 자체는 간단했지만 어플리케이션의 해당 부분을 담당하는 작성자와 코드베이스에서 쿼리를 찾아내는 데 많은 시간이 소요되었습니다.
- 몇 REGEXP 구문에서 5.6, 8.0 버전 간에 몇몇 호환성 문제가 있었습니다.
- 일부 어플리케이션에서는 `insert … on duplicate key` 구문을 InnoDB에서 실행하는 경우 [반복적인 read 트랜잭션 데드락](https://bugs.mysql.com/bug.php?id=98324)이 발생했습니다. 8.0 버전에서 일부 5.6 버전의 버그를 수정했었는데 해당 수정한 부분이 데드락을 유발할 가능성이 있다고 판단했습니다. 그래서 일부 쿼리를 분석한 후 격리 수준을 낮추어 해결할 수 있었습니다. 해당 옵션은 RBR로 전환한 이후에 사용할 수 있었습니다.
- 우리가 5.6에서 커스텀한 Document Store나 JSON 함수는 8.0에서 호환이 되지 않았습니다. 이에 따라 Document Store를 사용하는 어플리케이션은 문서 타입을 text로 변경해야 했습니다. 또한 8.0 서버에도 JSON 함수 기능을 추가하여 어플리케이션 마이그레이션 과정에서 문제가 없도록 하였습니다.

추가적으로 8.0 서버에서 진행한 쿼리와 성능 테스트로 빠른 시일 내에 해결해야 할 몇 문제를 발견했습니다.

- ACL 캐시 인근에서 새로운 뮤텍스(mutex) 경쟁 핫스팟을 발견했습니다. 동시에 많은 커넥션이 생성되는 경우에는 모든 ACL 체크 과정이 막힐 수 있습니다.
- binlog 파일이 많고 write 작업이 빈번한 경우에 binlog 인덱스에서도 비슷한 경쟁 상태가 발견되었습니다.
- Temp 테이블을 활용하는 몇 쿼리는 작동하지 않았습니다. 쿼리는 에러를 발생하며 실패하거나 너무 오래 실행되어 타임아웃이 발생하기도 했습니다.

8.0 버전에서 InnoDB를 구동해야 하기 때문에 특히 MyRocks 인스턴스의 경우 5.6 버전에 비해 메모리 사용량이 증가했습니다.
살펴보니 기본 performance_schema 설정으로 모든 기능이 활성화되었으며 꽤 많은 메모리를 잡아먹고 있었습니다.
그래서 소수의 기능만 활성화하고 수기로 처리할 수 없는 테이블은 비활성화하도록 코드를 수정하면서 메모리 사용을 제한하였습니다.
물론 모든 메모리 증가가 performance_schema 설정 때문에 발생한 것은 아니었습니다.
우리는 메모리 사용량을 줄이기 위해 InnoDB의 다양한 내부 데이터 구조를 파악하고 여러 값을 조정해야만 했습니다.
그 노력의 결실로 8.0 서버의 메모리 사용량이 적정량으로 내려갔습니다.

## 다음 할 일

MySQL 8.0 마이그레이션은 지금까지 몇 년이 소요되었습니다.
그리고 현재 모든 InnoDB 레플리카 그룹은 8.0에서 실행되도록 전환하였습니다.
나머지 서버들도 마이그레이션 단계를 따라 각 과정을 진행하고 있습니다.
커스텀 기능 중 대다수는 8.0으로 옮겨두었기 때문에 마이너 릴리즈를 따라 업데이트하는 건 상태적으로 쉬웠고 꾸준하게 최신 버전을 유지할 수 있었습니다.

5.7 버전을 건너뛰면서 마이그레이션 단계에서 해결해야 할 많은 문제가 있었습니다.

우선, 서버 자체를 업그레이드할 수 없었으며 새 서버를 빌드하여 덤프 데이터를 복사하는 방식을 택하였습니다.
하지만 운영되는 많은 서버에 이런 방식을 적용하기엔 너무 많은 시간이 소요되었으며 이런 취약한 프로세스 때문에 작업이 완료되기도 전에 중단될 가능성이 있었습니다.
이러한 수많은 인스턴스에 대한 처리 과정을 위해 백업 및 복원 시스템 수정이 필요했습니다.

두 번째로 5.7 버전에서 발생하는 deprecation 경고를 놓쳤기 때문에 API 변화를 파악하기 어려웠습니다.
대신 운영 워크로드 마이그레이션을 진행하기에 앞서 버그를 잡아내기 위해 추가적인 테스트를 진행하였습니다.
또한 자동으로 스키마를 처리하는 mysql 클라이언트 라이브러리를 사용하면서 많은 호환성 문제를 해결할 수 있었습니다.

레플리카 그룹에서 두 메이저 버전을 동시에 운영하는 건 쉽지 않았습니다.
8.0 인스턴스를 프라이머리로 선정하는 순간 최대한 빨리 5.6 서버들을 비활성하고 제거해야 했습니다.
어플리케이션 개발자는 보통 `utf8mb4_0900` collation과 같은 8.0에서만 지원되는 기능만 사용하는 경향이 있고, 이러한 상황이 8.0과 5.6 간의 복제 스트림을 중단할 수도 있습니다.

마이그레이션 과정 중 발생한 여러 방해에도 불구하고 8.0 서버를 운영하면서 여러 혜택을 받았습니다.
몇 어플리케이션은 Document Store 및 향상된 datetime과 같은 기능으로 빠르게 갈아탔습니다.
또한 MyRocks의 Instant DDL과 같은 스토리지 엔진 기능을 지원할 방법도 고려하고 있습니다.
전반적으로 새로운 버전을 도입하면서 MySQL로 할 수 있는 일이 크게 확장되었습니다.

---

# Migrating Facebook to MySQL 8.0

[MySQL](https://github.com/facebook/mysql-5.6), an open source database developed by Oracle, powers some of Facebook’s most important workloads.
We actively develop new features in MySQL to support our evolving requirements.
These features change many different areas of MySQL, including client connectors, storage engine, optimizer, and replication.
Each new major version of MySQL requires significant time and effort to migrate our workloads.
The challenges include:

- Porting our custom features to the new version
- Ensuring replication is compatible between the major versions
- Minimizing changes needed for existing application queries
- Fixing performance regressions that prevent the server from supporting our workloads

Our last major version upgrade, to MySQL 5.6, took more than a year to roll out.
When version 5.7 was released, we were still in the midst of developing our LSM-Tree storage engine, [MyRocks](https://engineering.fb.com/2016/08/31/core-infra/myrocks-a-space-and-write-optimized-mysql-database/), on version 5.6.
Since upgrading to 5.7 while simultaneously building a new storage engine would have significantly slowed the progress on MyRocks, we opted to stay with 5.6 until MyRocks was complete.
MySQL 8.0 was announced as we were finishing the rollout of MyRocks to our user database (UDB) service tier. 

That version included compelling features like writeset-based parallel replication and a transactional data dictionary that provided atomic DDL support.
For us, moving to 8.0 would also bring in the 5.7 features we had missed, including Document Store.
Version 5.6 was approaching end of life, and we wanted to stay active within the MySQL community, especially with our work on the MyRocks storage engine.
Enhancements in 8.0, like instant DDL, could speed up MyRocks schema changes, but we needed to be on the 8.0 codebase to use it.
Given the benefits of the code update, we decided to migrate to 8.0.
We’re sharing how we tackled our 8.0 migration project — and some of the surprises we discovered in the process.
When we initially scoped out the project, it was clear that moving to 8.0 would be even more difficult than migrating to 5.6 or MyRocks.

- At the time, our customized 5.6 branch had over 1,700 code patches to port to 8.0. As we were porting those changes, new Facebook MySQL features and fixes were added to the 5.6 codebase that moved the goalpost further away.
- We have many MySQL servers running in production, serving a large number of disparate applications. We also have extensive software infrastructure for managing MySQL instances. These applications perform operations like gathering statistics and managing server backups.
- Upgrading from 5.6 to 8.0 skipped over 5.7 entirely. APIs that were active in 5.6 would have been deprecated in 5.7 and possibly removed in 8.0, requiring us to update any application using the now-removed APIs.
- A number of Facebook features were not forward-compatible with similar ones in 8.0 and required a deprecation and migration path forward.
- MyRocks enhancements were needed to run in 8.0, including native partitioning and crash recovery.

## Code patches

We first set up the 8.0 branch for building and testing in our development environments.
We then began the long journey to port the patches from our 5.6 branch.
There were more than 1,700 patches when we started, but we were able to organize them into a few major categories.
Most of our custom code had good comments and descriptions so we could easily determine whether it was still needed by the applications or if it could be dropped.
Features that were enabled by special keywords or unique variable names also made it easy to determine relevance because we could search through our application codebases to find their use cases.
A few patches were very obscure and required detective work — digging through old design documents, posts, and/or code review comments — to understand their history.

We sorted each patch into one of four buckets:

1. Drop: Features that were no longer used, or had equivalent functionality in 8.0, did not need to be ported.
2. Build/Client: Non-server features that supported our build environment and modified MySQL tools like mysqlbinlog, or added functionality like the async client API, were ported.
3. Non-MyRocks Server: Features in the mysqld server that were not related to our MyRocks storage engine were ported.
4. MyRocks Server: Features that supported the MyRocks storage engine were ported.

We tracked the status and relevant historical information of each patch using spreadsheets, and recorded our reasoning when dropping a patch.
Multiple patches that updated the same feature were grouped together for porting.
Patches ported and committed to the 8.0 branch were annotated with the 5.6 commit information. Discrepancies on porting status would inevitably arise due to the large number of patches we needed to sift through and these notes helped us resolve them.

Each of the client and server categories naturally became a software release milestone.
With all client-related changes ported, we were able to update our client tooling and connector code to 8.0.
Once all of the non-MyRocks server features were ported, we were able to deploy 8.0 mysqld for InnoDB servers.
Finishing up the MyRocks server features enabled us to update MyRocks installations.

Some of the most complex features required significant changes for 8.0, and a few areas had major compatibility problems.
For example, upstream 8.0 binlog event formats were incompatible with some of our custom 5.6 modifications.
Error codes used by Facebook 5.6 features conflicted with those assigned to new features by upstream 8.0.
We ultimately needed to patch our 5.6 server to be forward-compatible with 8.0.

It took a couple of years to complete porting all of these features.
By the time we got to the end, we had evaluated more than 2,300 patches and ported 1,500 of those to 8.0.

## The migration path

We group together multiple mysqld instances into a single MySQL replica set.
Each instance in a replica set contains the same data but is geographically distributed to a different data center to provide data availability and failover support.
Each replica set has one primary instance.
The remaining instances are all secondaries.
The primary handles all write traffic and replicates the data asynchronously to all secondaries.

We started with replica sets consisting of 5.6 primary/5.6 secondaries and the end goal was replica sets with 8.0 primary/8.0 secondaries.
We followed a plan similar to the [UDB MyRocks migration plan](https://engineering.fb.com/2017/09/25/core-infra/migrating-a-database-from-innodb-to-myrocks/).

1. For each replica set, create and add 8.0 secondaries via a logical copy using mysqldump. These secondaries do not serve any application read traffic.
2. Enable read traffic on the 8.0 secondaries.
3. Allow the 8.0 instance to be promoted to primary.
4. Disable the 5.6 instances for read traffic.
5. Remove all the 5.6 instances.

Each replica set could transition through each of the steps above independently and stay on a step as long as needed.
We separated replica sets into much smaller groups, which we shepherded through each transition.
If we found problems, we could rollback to the previous step.
In some cases, replica sets were able to reach the last step before others started.

To automate the transition of a large number of replica sets, we needed to build new software infrastructure.
We could group replica sets together and move them through each stage by simply changing a line in a configuration file.
Any replica set that encountered problems could then be individually rolled back.

### Row-based replication

As part of the 8.0 migration effort, we decided to standardize on using row-based replication (RBR).
Some 8.0 features required RBR, and it simplified our MyRocks porting efforts.
While most of our MySQL replica sets were already using RBR, those still running statement-based replication (SBR) could not be easily converted.
These replica sets usually had tables without any high cardinality keys.
Switching completely to RBR had been a goal, but the long tail of work needed to add primary keys was often prioritized lower than other projects.

Hence, we made RBR a requirement for 8.0.
After evaluating and adding primary keys to every table, we switched over the last SBR replica set this year.
Using RBR also gave us an alternative solution for resolving an application issue that we encountered when we moved some replica sets to 8.0 primaries, which will be discussed later.

## Automation validation

Most of the 8.0 migration process involved testing and verifying the mysqld server with our automation infrastructure and application queries.

As our MySQL fleet grew, so did the automation infrastructure we use to manage the servers.
In order to ensure all of our MySQL automation was compatible with the 8.0 version, we invested in building a test environment, which leveraged test replica sets with virtual machines to verify the behaviors.
We wrote integration tests to canary each piece of automation to run on both the 5.6 version and the 8.0 version and verified their correctness.
We found several bugs and behavior differences as we went through this exercise.

As each piece of MySQL infrastructure was validated against our 8.0 server, we found and fixed (or worked around) a number of interesting issues:

1. Software that parsed text output from error log, mysqldump output, or server show commands easily broke. Slight changes in the server output often revealed bugs in a tool’s parsing logic.
2. The 8.0’s default `utf8mb4` collation settings resulted in collation mismatches between our 5.6 and 8.0 instances. 8.0 tables may use the new `utf8mb4_0900` collations even for create statements generated by 5.6’s show create table because the 5.6 schemas using `utf8mb4_general_ci` do not explicitly specify collation. These table differences often caused problems with replication and schema verification tools.
3. The error codes for certain replication failures changed and we had to fix our automation to handle them correctly.
4. The 8.0 version’s data dictionary obsoleted table .frm files, but some of our automation used them to detect table schema modifications.
5. We had to update our automation to support the dynamic privs introduced in 8.0.

### Application validation

We wanted the transition for applications to be as transparent as possible, but some application queries hit performance regressions or would fail on 8.0.

For the MyRocks migration, we built a MySQL shadow testing framework that captured production traffic and replayed them to test instances.
For each application workload, we constructed test instances on 8.0 and replayed shadow traffic queries to them.
We captured and logged the errors returning from the 8.0 server and found some interesting problems.
Unfortunately, not all of these problems were found during testing.
For example, the transaction deadlock was discovered by applications during the migration.
We were able to roll back these applications to 5.6 temporarily while we researched different solutions.

- New reserved keywords were introduced in 8.0 and a few, such as groups and rank, conflicted with popular table column names and aliases used in application queries. These queries did not escape the names via backquotes, leading to parsing errors. Applications using software libraries that automatically escaped the column names in queries did not hit these issues, but not all applications used them. Fixing the problem was simple, but it took time to track down application owners and codebases generating these queries.
- A few REGEXP incompatibilities were also found between 5.6 and 8.0.
- A few applications hit [repeatable-read transaction deadlocks](https://bugs.mysql.com/bug.php?id=98324) involving `insert … on duplicate key` queries on InnoDB. 5.6 had a bug which was corrected in 8.0, but the fix increased the likelihood of transaction deadlocks. After analyzing our queries, we were able to resolve them by lowering the isolation level. This option was available to us since we had made the switch to row-based replication.
- Our custom 5.6 Document Store and JSON functions were not compatible with 8.0’s. Applications using Document Store needed to convert the document type to text for the migration. For the JSON functions, we added 5.6-compatible versions to the 8.0 server so that applications could migrate to the 8.0 API at a later time.

Our query and performance testing of the 8.0 server uncovered a few problems that needed to be addressed almost immediately.

- We found new mutex contention hotspots around the ACL cache. When a large number of connections were opened simultaneously, they could all block on checking ACLs.
- Similar contention was found with binlog index access when many binlog files are present and high binlog write rates rotate files frequently.
- Several queries involving temp tables were broken. The queries would return unexpected errors or take so long to run that they would time out.

Memory usage compared with 5.6 had increased, especially for our MyRocks instances, because InnoDB in 8.0 must be loaded.
The default performance_schema settings enabled all instruments and consumed significant memory.
We limited the memory usage by only enabling a small number of instruments and making code changes to disable tables that could not be manually turned off.
However, not all the increased memory was being allocated by performance_schema.
We needed to examine and modify various InnoDB internal data structures to reduce the memory footprint further.
This effort brought 8.0’s memory usage down to acceptable levels. 

## What’s next

The 8.0 migration has taken a few years so far.
We have converted many of our InnoDB replica sets to running entirely on 8.0.
Most of the remaining ones are at various stages along the migration path.
Now that most of our custom features have been ported to 8.0, updating to Oracle’s minor releases has been comparatively easier and we plan to keep pace with the latest versions.

Skipping a major version like 5.7 introduced problems, which our migration needed to solve.

First, we could not upgrade servers in place and needed to use logical dump and restore to build a new server.
However, for very large mysqld instances, this can take many days on a live production server and this fragile process will likely be interrupted before it can complete.
For these large instances, we had to modify our backup and restore systems to handle the rebuild.

Second, it is much harder to detect API changes because 5.7 could have provided deprecation warnings to our application clients to fix potential issues.
Instead, we needed to run additional shadow tests to find failures before we could migrate the production workloads.
Using mysql client software that automatically escaped schema object names helps reduce the number of compatibility issues.

Supporting two major versions within a replica set is hard.
Once a replica set promotes its primary to be an 8.0 instance, it is best to disable and remove the 5.6 ones as soon as possible.
Application users tend to discover new features that are supported only by 8.0, like `utf8mb4_0900` collations, and using these can break the replication stream between 8.0 and 5.6 instances.

Despite all the hurdles in our migration path, we have already seen the benefits of running 8.0.
Some applications have opted for early conversion to 8.0 to utilize features like Document Store and improved datetime support.
We have been considering how to support storage engine features like Instant DDL on MyRocks.
Overall, the new version greatly expands on what we can do with MySQL @ Facebook.

---

References

- [Migrating Facebook to MySQL 8.0 - Engineering at Meta](https://engineering.fb.com/2021/07/22/data-infrastructure/mysql/)
