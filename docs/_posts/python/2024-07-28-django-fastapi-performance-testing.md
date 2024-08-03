---
layout: post
title: "Django와 FastAPI 간의 성능 테스트"
category: django
tags:
  - django
  - fastapi
  - locust
  - persistent connections
thumbnail: "/img/thumbnails/django-fastapi-performance-testing.png"
---

2022년도 즈음부터 FastAPI가 부상하기 시작했는데, 기존 Django 프로젝트만 운영해 본 필자는 동일한 로직을 FastAPI로 옮긴다면 성능이 얼마나 달라질까 하는 생각을 많이 해보았습니다.
현재에도 Django 와 FastAPI 각각 프로덕션 레벨에서 운영해 보았지만 서로 성격이 달라서 직접적으로 비교하기는 애매했습니다.

그래서 아예 이번 기회에 서버와 데이터베이스 환경을 동일하게 맞추어주고 같은 로직을 프레임워크만 바꾸어 테스트한다면 어떤 차이가 있을지 확인해 보았습니다.

---

# 1. Scenario

먼저 일반적인 커머스 플랫폼을 가정하여 사용자가 상품을 조회한 후 주문하는 시나리오를 세웠습니다.
마치 이벤트 오픈 시점에 많은 사용자가 몰려들어 주문이 발생하는 상황처럼 과도한 트래픽이 유입되는 환경에서도 서버가 정상적으로 동작하는지 여부를 모니터링하고자 합니다.

<img src="/img/posts/django-fastapi-performance-testing-flow.png" style="max-width:720px"/>

관련된 사용자 행동을 정의하여 _상품 리스트 조회 → 상품 조회 → 주문 요청 → 주문 조회_ 순으로 진행되도록 하였습니다.

각 사용자 행동마다 하나의 API를 할당하였고 API 최대 응답 시간을 100ms로 설정하여 기준치가 넘어가는 시점을 기록하였습니다.

---

# 2. Testing Environment

## 2.1 Server

어플리케이션 서버는 개인적으로 사용 중이던 **AWS Lightsail** 인스턴스를 활용하였습니다.
서버 사양은 vCPU 1개에 메모리 512MB 정도 되었는데 서버 사양을 높게 잡아버리면 자칫하다가는 오히려 데이터베이스가 소화를 못 할 수 있을 것 같아서 데이터베이스 사양보다는 작게 잡았습니다.

데이터베이스는 **PostgreSQL**을 사용하였습니다.
데이터베이스 특성상 [Vacuum](/docs/postgres-vacuum)으로 인한 성능 차이가 발생할 수 있을 것 같아서 매 테스트마다 데이터베이스 및 테이블을 새로 생성해 주었습니다.

<img src="/img/posts/django-fastapi-performance-testing-erd.png" style="max-width:420px"/>

테이블 구조는 최대한 단순하게 설계하였습니다.
상품 품목에 상품 수량과 판매 수량을 관리하여 주문이 일어날 때마다 판매 수량을 더해주도록 하였습니다.

구체적인 스펙은 아래와 같습니다

- 서버: Amazon Linux 2 AMI (512MB RAM / 1 vCPU)
- 데이터베이스: PostgreSQL 12.7 (1GB RAM/ 2 vCPU)
- 웹서버: Nginx 1.27.0
- 언어: Python 3.12

기본적인 환경은 이렇게 통일하고 프레임워크만 **Django 4.2**와 **FastAPI 0.111**로 설정하였습니다.
테스트에 사용한 어플리케이션 소스코드는 깃헙에 올려두었으니 [django-app](https://github.com/miintto/django-app), [fastapi-app](https://github.com/miintto/fastapi-app) repo를 참고 부탁드립니다.

## 2.2 Testing Tool

테스트 도구로는 파이썬 기반 테스트 도구 **Locust**를 활용하였습니다.
로컬 환경에서 Locust 서버를 실행하고 도메인이 설정된 어플리케이션 서버에 요청을 보내는 방식으로 진행했습니다.

<img src="/img/posts/django-fastapi-performance-testing-locust-flow.png" style="max-width:480px"/>

Locust를 사용하면 간단하게 스크립트를 작성하여 테스트 시나리오를 세울 수 있으며, 테스트 진행 시에는 요청 수치를 일정하게 늘려가며 점점 부하를 줄 수 있습니다.
Gevent 기반으로 실행되는데, user마다 각각 그린 스레드(green thread)에 할당되어 서버에 요청을 보내게 됩니다.

---

# 3. Results

## 3.1 FastAPI Report

먼저 FastAPI 어플리케이션 테스트를 진행하였습니다.

<img src="/img/posts/django-fastapi-performance-testing-report-fastapi-1.png" style="max-width:540px"/>

처음 user를 40으로 설정하여 5분 정도 유지하였고, 상황을 보아서 50, 60, 70으로 차차 높였습니다.
user 수치를 60으로 올린 후에 평균 응답 시간이 100ms를 넘어섰고, 70까지 올렸을 때는 160ms에 다다랐습니다.

<img src="/img/posts/django-fastapi-performance-testing-report-fastapi-2.png" style="max-width:540px"/>

마지막에 user를 80까지 높여보았으나 서버가 죽어버려서 응답을 받지 못하는 상황까지 이루어졌습니다.
RPS 수치를 보아 초당 최대 100개의 요청까지 처리 가능한 것으로 보여집니다.

<img src="/img/posts/django-fastapi-performance-testing-cpu-usage-fastapi.png" style="max-width:420px"/>

테스트가 진행되던 시점의 서버 CPU 수치를 확인해 보았는데 서버 자원을 잘 사용하는 것으로 보여집니다.

## 3.2 Persistent Connections in Django

그다음으로 Django 환경으로 변경하여 테스트를 진행했는데 사소한 문제가 있었습니다.

<img src="/img/posts/django-fastapi-performance-testing-report-django-1.png" style="max-width:540px"/>

최초 테스트에서 user 수가 20을 넘어가면서부터 기준치 100ms를 훌쩍 넘어가 버렸습니다.
아무리 Django가 무겁다고 하지만 이렇게나 차이가 나는 부분이 의아하여 다시 로직을 점검해 보았습니다.

확인해 보니 테스트 시점에 데이터베이스의 부하가 다소 높게 나타났습니다.
이전 FastAPI 테스트에서는 데이터베이스 CPU 사용률이 20% 미만으로 유지되었지만 이번 테스트에서는 40%까지 치솟은 반면 어플리케이션 서버의 CPU 사용률은 50% 정도밖에 되지 않았습니다.
Django의 데이터베이스 연결 및 처리 쪽에 문제가 있는 것 같아 해당 부분을 다시 한번 조사해 보았습니다.

기본적으로 Django에서는 커넥션 풀(connection pool) 기능을 지원하지 않고 있습니다.
대신 **지속 연결**(persistent connections) 방식으로 한 번 연결한 커넥션의 유지 시간을 조절할 수 있습니다.

```python
# settings.py
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "test-db",
        "USER": "user",
        "PASSWORD": "****",
        "HOST": "test.rds.amazonaws.com",
        "PORT": 5432,
        "CONN_MAX_AGE": 60,  # 60초로 설정
    }
}
```

데이터베이스 세팅에서 `CONN_MAX_AGE` 값으로 커넥션의 최대 수명 기간을 설정할 수 있습니다.
기본값이 0이라 별다른 설정이 없다면 매 HTTP 요청마다 데이터베이스 커넥션을 연결하고 끊는 과정을 반복하게 됩니다.
만약 요청이 많아진다면 데이터베이스 연결 과정에서 불필요한 오버헤드가 발생할 수 있습니다.
Django의 Persistent Connections 관련해서는 [다음 포스트](/docs/django-db-connection)에서 좀 더 자세히 설명하겠습니다.

해당 설정값을 60초로 변경해 두고 다시 테스트를 진행했습니다.

## 3.3 Django Report

두 번째 Django 테스트에서는 처음 user 수치를 30으로 낮추어 시작했습니다.

<img src="/img/posts/django-fastapi-performance-testing-report-django-2.png" style="max-width:540px"/>

User 수치를 40, 50, 60, 70으로 올리면서 상황을 지켜보았는데, FastAPI에서와 같이 user 60에서 평균 응답 시간이 100ms를 초과하였습니다.
RPS도 100 내외를 유지하였습니다.

<img src="/img/posts/django-fastapi-performance-testing-cpu-usage-django.png" style="max-width:420px"/>

어플리케이션 서버 CPU 사용률도 문제없어 보입니다.

---

# 4. Conclusion

결론적으로 두 프레임워크에서 비슷한 결과가 나왔습니다.
한쪽이 어느 정도 우월하게 나와야 흥미로웠을 텐데 어쩌다 보니 좀 싱겁게 되어버렸습니다.

개인적으로 ORM 관련해서는 Django ORM 보다 SQLAlchemy의 성숙도가 뛰어나다고 생각해서 데이터베이스 CRUD 작업 관련해서는 FastAPI가 효율이 더 좋을 거라고 예상했었는데 막상 뚜껑을 열어보니 그다지 큰 차이가 없었습니다.
사실 ORM이 직접적으로 어떤 기능을 한다기보다는 파이썬 코드를 SQL로 변환하는 게 주요 역할이라서 동일한 데이터베이스에서는 비슷한 결과가 나오는 게 당연한 수순인 것 같습니다.

이번 테스트의 결과는 Django와 FastAPI의 전반적인 결과가 아닌 단순 데이터베이스 CRUD 상황에만 국한됩니다.
이미지 처리나 HTML 렌더링 같은 다른 로직이나 개발 속도까지도 고려한다면 얼마든지 다른 결과가 나타날 수 있습니다.

---

References

- [Databases \| Django documentation \| Django](https://docs.djangoproject.com/en/5.0/ref/databases/#persistent-connections)
- [[DB] Postgres와 Django의 Connection 관리 \| by chrisjune \| Medium](https://chrisjune-13837.medium.com/postgres%EC%99%80-django%EC%9D%98-connection-%EA%B4%80%EB%A6%AC-5acf3f5c28a7)
- [(Django) DB Connection을 관리하는 방법](https://americanopeople.tistory.com/260)
