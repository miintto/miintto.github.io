---
layout: post
title: "[번역] QueryGPT - 자연어를 SQL로 변환"
category: articles
tags:
  - llm
  - sql
  - uber
toc: true
thumbnail: "/img/thumbnails/uber-engineering.png"
---

> 해당 포스트는 Uber 기술 블로그의 [QueryGPT – Natural Language to SQL Using Generative AI](https://www.uber.com/en-KR/blog/query-gpt/?uclick_id=fd995b6c-c3ef-4810-b3ee-b24b40381a28){:target="_blank"} 포스트를 번역한 글입니다.
> 
> 게시일: 2024.09.19

# 생성형 AI를 활용하여 자연어를 SQL로 번환

SQL은 Uber 내부 엔지니어 및 데이터 분석가들이 사용하는 필수 도구이며 매일마다 수많은 데이터를 조회하고 있습니다.
이런 쿼리를 작성하는 건 SQL에 대한 문법뿐 아니라 비즈니스 로직이 내부 데이터 모델에 어떻게 저장되는지에 대한 깊은 이해가 필요합니다.
QueryGPT는 이러한 목적에 의해 탄생했습니다.
사용자가 입력하는 자연어 프롬프트로 SQL을 생성하여 생산성을 높이는 기능을 합니다.

QueryGPT는 LLM(Large Language Models), 벡터 데이터베이스 및 유사성 검색을 활용하여 사용자가 입력한 영어 질문에서 복잡한 쿼리을 뽑아냅니다. 

이번에는 지난 한 해 동안의 저희 개발 일대기와 현재 어디까지 왔는지 말씀드리겠습니다.

## 도입 계기

<img src="/img/posts/uber-querygpt-img001.png" style="max-width:600px"/>

Uber 데이터 플랫폼에서는 매달 120만 개가 넘는 쿼리를 처리하고 있습니다.
운영팀은 가장 큰 사용자 조직으로 전체 쿼리의 36%를 차지하고 있습니다.
일반적으로 이런 쿼리를 작성하려면 꽤 많은 시간이 소요되는데, 데이터 딕셔너리에서 관련된 데이터셋을 찾아서 편집기에 해당하는 쿼리를 작성해야 합니다. 
각 쿼리를 직접 작성하는데 10분 정도 걸린다고 할 때, QueryGPT를 통해 약 3분 만에 쿼리를 생성하는 것은 상당한 생산성 향상을 의미합니다.

보수적으로 잡아서 각 쿼리를 직접 작성하는데 10분 정도 걸린다고 해도, QueryGPT는 이러한 과정을 자동화하여 3분 만에 신뢰할 만한 쿼리를 만들어낼 수 있습니다.
결과적으로 Uber의 많은 효율성 향상으로 이어질 것입니다.

<img src="/img/posts/uber-querygpt-img002.avif" style="max-width:420px"/>

<img src="/img/posts/uber-querygpt-img003.avif" style="max-width:600px"/>

## 아키텍쳐

처음 QueryGPT가 제작된 건 2023년 생성형 AI Hackdays 기간이었습니다.
그때부터 QueryGPT 내부의 주요 알고리즘을 지속적으로 개선하였고, 단순 구상에만 그치던 제품을 운영 환경에 선보일 준비를 하였습니다.
이제부터 QueryGPT의 발전과 현재 아키텍쳐에 대해 설명하며 주요 개선사항에 대해 말씀드리겠습니다.

하단에는 현재 버전의 QueryGPT에 대해서도 설명해두었습니다.
다만 유념하실 점은 초기 버전과 현재 사이에 20번 이상 개선이 있었으며, 해당 과정을 모두 설명할 경우 해당 블로그의 길이가 아인 랜드의 _움츠린 아틀라스(Atlas Shrugged)_ 뺨칠 정도로 길어진다는 것입니다.

### Hackdayz (버전 1)

<img src="/img/posts/uber-querygpt-img004.png" style="max-width:600px"/>

QueryGPT 초기 버전은 비교적 간단한 RAG 로직으로 되어있었는데, LLM 호출 시에 포함할 관련 샘플을 추출하는 것을 목적으로 했습니다.
먼저 사용자의 자연어 프롬프트를 가져와서 벡터화(vectorize)를 진행하였으며, SQL샘플과 스키마에 유사도 검색(k-nearest neighbor 검색)을 수행하여 3개의 연관 테이블과 7개의 관련 SQL 샘플을 뽑아내었습니다.

초기 버전에서는 샘플 데이터셋으로 7개의 테이블과 20개의 SQL 쿼리를 사용했습니다.
SQL 쿼리는 LLM에게 테이블 스키마를 활용하는 방법에 대한 가이드 목적이었으며, 테이블 스키마는 LLM에게 해당 테이블에 존재하는 컬럼 정보를 제공했습니다.

예를 들어 uber.trips_data(실제로는 존재하지 않음) 테이블에 대해 스키마는 아래와 같습니다.

<img src="/img/posts/uber-querygpt-img005.png" style="max-width:600px"/>

LLM이 Uber 내부 시스템에 대해 이해하고 데이터셋을 올바르게 다루기 위해서 LLM 호츨 시에 추가적인 지침을 입력하였습니다.
아래 항목은 LLM이 날짜 데이터를 의도한 대로 처리하도록 추가한 가이드 중 일부입니다.

<img src="/img/posts/uber-querygpt-img006.png" style="max-width:600px"/>

우리는 관련된 모든 스키마 샘플, SQL 샘플, 사용자 프롬프트 및 Uber 내부의 비즈니스 지침을 시스템 프롬프트로 한데 묶어서 LLM에 요청하도록 하였습니다.

그리고 응답 포맷에는 LLM이 생성한 "SQL 쿼리"와 그에 대한 "설명"으로 구성하였습니다.

<img src="/img/posts/uber-querygpt-img007.png" style="max-width:600px"/>

다만, 해당 버전의 알고리즘은 작은 규모의 스키마와 SQL 샘플에서는 잘 동작하였지만, 더 많은 테이블을 추가하고 서비스에서 돌아가던 SQL 샘플을 늘려나가면서 쿼리 결과물의 정확도가 점점 떨어지기 시작했습니다.

### 고도화된 RAG

사용자 프롬프트("어제 시애틀에서 완료된 운행 몇 개인지 찾아줘"), 스키마(_CREATE TABLE…_), SQL 쿼리(_SELECT a, b, c FROM uber.foo …_) 사이에서는 간단한 유사도 검색을 하더라도 관련된 결과가 반환되지 않습니다.

### 사용자의 의도 파악

또 다른 문제점은 사용자가 입력한 프롬프트에서 관련된 스키마를 발라내기가 상당히 까다롭다는 것입니다.
우리에게 필요한 건 사용자 프롬프트에서 "의도"를 뽑아서 분류한 후 관련된 스키마와 SQL로 매핑시키는 중간 단계였습니다.

### 거대한 스키마 처리

Uber 내부 주요 테이블은 거대한 스키마로 구성되어 있는데, 일부 테이블은 컬럼이 200개 넘게 있는 경우도 있습니다.
이러한 테이블은 한 번 요청시에 40-60K 토큰을 잡아먹기도 합니다.
당시 가장 큰 모델도 최대 32K 토큰까지만 지원했기 때문에 이렇게 거대한 테이블이 3개 이상 포함된다면 LLM 요청이 실패할 수도 있습니다.

## 현재 디자인

아래 다이어그램은 현재 운영 환경의 QueryGPT 구조를 나타냈습니다.
현재 버전은 초기 버전을 개선한 내용까지 포함하고 있습니다.

<img src="/img/posts/uber-querygpt-img008.png" style="max-width:600px"/>

### 워크스페이스

현재 시스템에는 "워크스페이스(Workspaces)"라는 개념을 도입하여 광고, 모빌리티 및 코어 서비스 등 특정 비즈니스 도메인에 맞추어 SQL 샘플과 테이블을 제공하고 있습니다.
이런 워크스페이스들을 통해 LLM의 탐색 범위를 좁히고 생성되는 쿼리의 정확도를 높일 수 있었습니다.

우리는 Uber 내부에서 공통적으로 사용하는 비즈니스 도메인을 정의하였고 이를 백엔드에서 "시스템 워크스페이스"로 구분하였습니다.
모빌리티는 이러한 시스템 워크스페이스 중 하나로, 쿼리 생성을 위해 사용할 필수적인 도메인으로 선정하였습니다.

**_모빌리티_** : 운행, 운전자 및 기타 관련 쿼리

> 어제 시애틀에서 테슬라 차량으로 완료된 운행 몇 개인지 조회하는 쿼리 작성해줘

이와 더불어 코어 서비스, 플랫폼 엔지니어링, IT, 광고 등 11개의 시스템 워크스페이스에도 동일한 기능을 확장하였습니다.

또한 기존 시스템 워크스페이스에서 원하는 쿼리를 가져올 수 없는 경우에는 사용자 입맛에 맞게 커스텀 워크스페이스를 생성할 수 있도록 하였습니다.

### 의도 에이전트

사용자가 입력하는 모든 프롬프트는 먼저 "의도" 에이전트가 처리합니다.
의도 에이전트의 목적은 사용자의 질의를 비즈니스 도메인이나 워크스페이스(더 나아가 도메인에 할당된 SQL 샘플 및 테이블)에 매칭시키는 것입니다.
해당 단계에서 LLM 호출을 통해 사용자의 프롬프트에서 의도를 추론하고 "시스템" 워크스페이스나 "커스텀" 워크스페이스로 분류합니다.

이렇게 비즈니스 도메인을 특정하면서 RAG가 탐색해야 하는 범위를 크게 좁힐 수 있었습니다.

### 테이블 에이전트

일부 사용자로부터 QueryGPT가 선택한 테이블이 적절하지 않다는 피드백을 받았고, 이에 따라 조회할 테이블을 사용자가 직접 선택하는 기능을 만들었습니다.

이를 해결하는 과정에서 또 다른 에이전트(테이블 에이전트)를 추가하였는데, 올바른 테이블을 선택하여 사용자에게 표시한 후 확인을 받거나 혹은 테이블을 수정할 수 있도록 하였습니다.
아래 스크린샷은 사용자에게 제공되는 화면입니다.

<img src="/img/posts/uber-querygpt-img009.png" style="max-width:600px"/>

사용자는 "Looks Good" 버튼을 누르거나 리스트에서 선택한 테이블로 조정하여 LLM이 해당 쿼리에 사용하도록 지시할 수 있습니다.

### 컬럼 소거 에이전트

QueryGPT를 운영하면서 발견한 또 다른 문제점은 일부 쿼리 생성중에 발생하는 불규칙한 토큰 사이즈였습니다.
우리는 OpenAI GPT-4 Turbo 모델을 사용하며 128K 토큰까지 사용할 수 있었으나, 일부 요청에서 많은 토큰을 잡아먹는 테이블을 포함하면서 여전히 토큰이 초과하는 문제가 발생했습니다.

이를 위해 "컬럼 소거" 에이전트를 추가하였고, LLM 호출시에 LLM에 입력하는 스키마에서 관련 없는 컬럼을 제거하도록 하였습니다.

에이전트가 반환하는 결과는 아래와 같습니다.

<img src="/img/posts/uber-querygpt-img010.png" style="max-width:600px"/>

해당 결과는 쿼리 생성시에 필요한 스키마의 간소화 버전을 담고 있습니다.
이러한 방식으로 단순 토큰 사이즈와 LLM 호출 비용뿐 아니라 입력문 사이즈가 간소화되어 응답 속도까지 개선되었습니다.

### 결과문

현재 아키텍처에서도 결과문 형식은 바꾸지 않았습니다.
응답 포맷은 위에서 설명한 내용과 비슷하게 SQL 쿼리와 그에 대한 설명으로 구성되어 있습니다.

## 평가

QueryGPT의 성능이 향상되는 현황을 파악하기 위해서 표준화된 평가 절차가 필요했습니다.
이를 참고하여 서비스의 반복되는 문제와 비정상적인 문제를 구분할 수 있었고 성능을 점진적으로 끌어올리게 되었습니다.

### 평가 자료

평가를 위한 프롬프트 질의와 SQL 정답 자료를 제작하는 과정에서 꽤 많은 수작업이 필요했습니다.
우리는 QueryGPT 로그에서 실제 질의를 가져왔고 그 의도와 해당 답변을 위한 스키마, 올바른 SQL을 수기로 검증하였습니다.
이러한 질문-답변 세트는 전반적인 비즈니스 도메인을 포괄하도록 하였습니다.

### 평가 절차

우리는 유연한 절차를 만들었고, 운영 및 스테이지 환경에서 다양한 제품 플로우를 활용하여 쿼리 생성 신호을 수집하도록 하였습니다.

| 제품 플로우 | 목적 | 절차
|---|---|---
| Vanilla | QueryGPT의 기본 성능 측정 | 질문 입력. QueryGPT는 질의의 의도와 답변에 필요한 데이터셋 추론. 데이터셋과 의도 기반으로 SQL 생성. 의도, 데이터셋, SQL 평가.
| Decoupled | 사람이 개입된 방식으로 QueryGPT 성능 측정. 이전 결과에 대한 성능 의존성을 제거하여 각 단계별 단위 평가 가능. | 질문, 의도, 데이터셋 입력. QueryGPT는 의도와 데이터셋 추론. 실제(추론하지 않은) 의도와 데이터셋 기반으로 SQL 생성. 의도, 데이터셋, SQL 평가.

그리고 각 질의를 평가할 때마다 아래와 같은 신호를 수집합니다.

**의도**: 질의에 할당된 의도가 정확한지?

**테이블 오버랩**: 검색 및 테이블 에이전트가 식별한 테이블이 올바른지?
해당 결과는 0과 1 사이의 점수로 나타납니다.
예를 들어 "지난주 로스앤젤레스에서 운전자가 취소한 운행 개수는?"을 답변하기 위해서 실제 [_fact_trip_state_, _dim_city_] 테이블이 필요하고, QueryGPT가 [_dim_city_, _fact_eats_trip_]를 선택했다고 하면 검색 오버랩 점수는 0.5 입니다.

**성공적인 실행**: 생성된 쿼리가 문제없이 실행되었는지?

**실행 결과**: 실행한 쿼리가 1개 이상의 결과를 반환하는지?
(가끔 QueryGPT가 WHERE status = "Finished"와 같이 존재하지 않는 조건문을 생성하여 결과가 없는 상황이 발생하기도 합니다. 올바른 조건은 WHERE status = "Completed" 입니다.)

**쿼리의 질적 유사도**: 생성된 쿼리가 실제 정답과 얼마나 유사한지?
우리는 LLM을 활용하여 0과 1 사이의 점수를 부여하도록 하였습니다.
이를 통해 문법 오류로 실패한 쿼리라도 컬럼이나 조인, 함수를 올바르게 사용했는지 빠르게 파악할 수 있습니다.

우리는 시간이 지남에 따라 이러한 진행 상황을 시각화하였고, 성능이 저조한 부분이나 개선이 필요한 패턴을 파악하였습니다.

아래는 질문 단위의 실행 결과를 보여주는 예시로, 개별 질문마다 반복되는 문제를 한눈에 확인할 수 있습니다.

<img src="/img/posts/uber-querygpt-img011-1.png" style="max-width:180px"/>

<img src="/img/posts/uber-querygpt-img011-2.png" style="max-width:600px"/>

각 질문마다 생성된 SQL, 에러 사유, 관련된 성능 지표를 확인할 수 있습니다.
아래는 지속적으로 실패한 쿼리중 하나인데, WHERE 조건에 파티션 필터 조건이 빠져있었기 때문입니다.
하지만 LLM 기반의 평가에서는 생성된 쿼리 외에 다른 부분은 정답과 매우 유사하다는 점을 확인할 수 있습니다.

<img src="/img/posts/uber-querygpt-img012.png" style="max-width:600px"/>

또한 각 평가 단계마다 정확도 및 레이턴시(latency) 지표도 집계하여 지속적으로 성능을 관찰하고 있습니다.

<img src="/img/posts/uber-querygpt-img013.png" style="max-width:600px"/>

### 한계

LLM은 비결정적(non-deterministic)특성을 가지고 있기 때문에, QueryGPT 서비스에 아무런 변화를 주지 않고 동일한 평가를 반복하더라도 다른 결과가 나올 수 있습니다.
그래서 보통 대부분의 지표에서 약 5% 정도의 차이까지는 과도하게 집착하지 않으려고 했습니다.
대신 오랜 시간에 걸쳐 나타나는 오류 패턴을 잡아내서 특정한 기능을 개선하는 방식으로 진행하였습니다.

Uber는 수십만 개의 데이터셋이 존재하며 문서화 수준도 다양합니다.
따라서 질의 평가만으로 전체적인 비즈니스에 대한 모든 질문을 커버하는 건 불가능합니다.
그 대신 우리는 현재 제품에서 대표적으로 사용되는 질의들을 선별하였습니다.
정확도가 높아지고 새로운 버그가 계속 발생함에 따라 평가에 쓰이는 자료 역시 제품의 방향성에 따라 진화할 예정입니다.

절때 하나의 정답만 존재하지 않습니다.
동일한 질문에 대해서도 다른 테이블을 바라보거나 다른 스타일의 쿼리를 작성할 수 있습니다.
따라서 생성된 SQL과 정답을 시각화하고 LLM 기반으로 점수를 매겨서 생성된 쿼리가 다른 스타일로 작성되었더라도 유사한 의도를 가지고 있는지 파악할 수 있습니다.

## 교훈

지난 1년간 GPT와 LLM 같은 신생 기술을 활용하면서, 에이전트와 LLM이 사용자 질의에 답하기 위해 데이터를 다루는 다양한 뉘앙스에 대해 실험하고 배울 수 있었습니다.
아래에 그 여정에서 학습한 내용을 간략하게 정리해 보았습니다.

### LLM의 훌륭한 분류 성능

QueryGPT의 중간 에이전트는 내부에서 사용자의 자연어 프롬프트를 RAG의 개선된 신호로 분해하기 위해 사용되었는데, QueryGPT 초기 버전에 비해 정확도가 훨씬 향상했습니다.
그 이유로는 매우 작고 특화된 작업만 주어졌을 때 LLM이 매우 잘 작동했기 때문입니다.

의도 에이전트, 테이블 에이전트, 컬럼 소거 에이전트는 각각 광범위한 작업이 아닌 단일 역할만 맡겨졌기 때문에 각자의 역할을 훌륭하게 수행했습니다.

### 할루시네이션

해당 영역은 지속적으로 개선하고 있는 부분이지만, LLM이 존재하지 않는 컬럼이나 테이블을 포함된 쿼리를 생성하는 현상은 계속 나타나고 있습니다.

우리는 이러한 할루시네이션을 줄이기 위해 프롬프트 실험을 진행하였고, 생성된 쿼리를 사용자가 반복적으로 조정할 수 있는 채팅 시스템을 도입하였으며, "검증" 에이전트를 추가하여 할루시네이션을 반복적으로 수정하도록 하고 있지만, 해당 문제는 여전히 해결되지 않고 있습니다.

### 사용자 프롬프트는 맥락이 부족할 수 있음

사용자가 QueryGPT에 입력하는 질의는 적절한 키워드를 사용하여 매우 세세하게 묘사된 질문부터 단 5글자(오타를 포함해서) 질문까지 매우 다양하며, 모호한 질문에 대한 정답을 얻기 위해 여러 테이블을 조인해야 하는 경우가 생길 수도 있습니다.

단지 사용자가 입력한 질의만을 올바르다고 판단하여 LLM에 입력한다면 정확성과 신뢰성 면에서 문제가 생길 수 있습니다.
그래서 우리는 "프롬프트 확장기"라는 중간 단계를 두어 사용자가 입력한 질의를 LLM에 보내기 전에 맥락을 보완하여 풍부하게 확장하는 과정을 추가하였습니다.

### LLM이 생성하는 SQL에 대한 높은 기대치

해당 버전의 QueryGPT는 다양한 사람들에게 유용하지만, 대다수의 사람은 생성된 쿼리가 매우 정확하고 바로 작동할 것이라는 기대를 가지고 있습니다.
그 기대치가 매우 높습니다!

우리 경험상, 이런 제품을 제작하는 경우 초기 사용자층을 적절하게 선정하여 테스트하는 것이 좋다고 생각합니다.

# 결론

Uber에서 QueryGPT를 개발하는 과정은 혁신적인 여정이었으며, 자연어 프롬프트로 SQL 쿼리를 생성하는 작업으로 생산성 및 효율성을 크게 끌어올렸습니다.
향상된 AI 모델이 적용된 QueryGPT는 Uber의 광범위한 생태계에 매끄럽게 통합되었으며, 쿼리 작성 시간을 단축하고 정확도를 개선하면서 데이터 규모와 복잡성 문제를 동시에 해결했습니다.

여전히 거대한 스키마 처리와 할루시네이션 감소 같은 과제가 존재하지만, 반복적인 접근 방식과 꾸준한 학습을 통해 지속적인 발전을 이루고 있습니다.
QueryGPT는 데이터 접근 방식을 단순화했을 뿐 아니라 Uber의 다양한 조직이 쉽게 접근하여 강한 인사이트를 활용할 수 있도록 하였습니다.

현재는 운영팀과 고객지원팀 대상으로만 제한적으로 공개하였으며, 매일마다 300명의 활성 사용자가 QueryGPT를 사용하고 있는데, 이 중 약 78%는 쿼리를 처음부터 작성하던 것에 비해 시간을 절약하게 되었다고 답했습니다.

앞으로 더 정교한 AI 기술과 사용자 피드백으로 더욱 고도화하여 QueryGPT가 Uber 데이터 플랫폼의 핵심 도구로 자리매김하길 기대합니다.

---

<details>
<summary>원문 보기</summary>
<div markdown="1">

# Introduction

SQL is a vital tool used daily by engineers, operations managers, and data scientists at Uber to access and manipulate terabytes of data.
Crafting these queries not only requires a solid understanding of SQL syntax, but also deep knowledge of how our internal data models represent business concepts.
QueryGPT aims to bridge this gap, enabling users to generate SQL queries through natural language prompts, thereby significantly enhancing productivity.

QueryGPT uses large language models (LLM), vector databases, and similarity search to generate complex queries from English questions that are provided by the user as input.

This article chronicles our development journey over the past year and where we are today with this vision.

## Motivation

<img src="/img/posts/uber-querygpt-img001.png" style="max-width:600px"/>

At Uber, our data platform handles approximately 1.2 million interactive queries each month.
The Operations organization, one of the largest user cohorts, contributes to about 36% of these queries.
Authoring these queries generally requires a fair amount of time between searching for relevant datasets in our data dictionary and then authoring the query inside our editor.
Given that each query can take around 10 minutes to author, the introduction of QueryGPT, which can automate this process and generate reliable queries in just about 3 minutes, represents a major productivity gain.

If we make a conservative estimate that each query takes about 10 minutes to author, QueryGPT can automate this process and provide sufficiently reliable queries in about 3 minutes.
This would result in a major productivity gain for Uber.

<img src="/img/posts/uber-querygpt-img002.avif" style="max-width:420px"/>

<img src="/img/posts/uber-querygpt-img003.avif" style="max-width:600px"/>

## Architecture

QueryGPT originated as a proposal during Uber’s Generative AI Hackdays in May 2023. Since then, we have iteratively refined the core algorithm behind QueryGPT, transitioning it from concept to a production-ready service.
Below, we detail the evolution of QueryGPT and its current architecture, highlighting key enhancements..

We’ve described below our current version of QueryGPT.
Please bear in mind that there were about 20+ iterations of the algorithm between the 2 detailed below and if we were to list and describe each, the length of this blog article would put Ayn Rand’s _Atlas Shrugged_ to shame.

### Hackdayz (version 1)

<img src="/img/posts/uber-querygpt-img004.png" style="max-width:600px"/>

The first version of QueryGPT relied on a fairly simple RAG to fetch the relevant samples we needed to include in our query generation call to the LLM (Few Shot Prompting).
We would take the user’s natural language prompt, vectorize it and do a similarity search (using k-nearest neighbor search) on the SQL samples and schemas to fetch 3 relevant tables and 7 relevant SQL samples.

The first version used 7 tier 1 tables and 20 SQL queries as our sample data set.
The SQL queries were supposed to provide the LLM guidance on how to use the table schemas provided and the table schemas provided the LLM information about the columns that existed on those tables.

For example, for a tier 1 table, uber.trips_data (not a real table), this is what the schema would look like:

<img src="/img/posts/uber-querygpt-img005.png" style="max-width:600px"/>

To help the LLM understand internal Uber lingo and work with Uber datasets, we also included some custom instructions in the LLM call.
Shown below is a snippet of how we wanted the LLM to work with dates:

<img src="/img/posts/uber-querygpt-img006.png" style="max-width:600px"/>

We would wrap all the relevant schema samples, SQL samples, user’s natural language prompt, and Uber Business instructions around a system prompt and send the request to the LLM.

The response would include an “SQL Query” and an “Explanation” of how the LLM generated the query:

<img src="/img/posts/uber-querygpt-img007.png" style="max-width:600px"/>

While this version of the algorithm worked well for a small set of schemas and SQL samples, as we started to onboard more tables and their associated SQL samples into the service, we started seeing declining accuracy in the generated queries. 

### Better RAG

Doing a simple similarity search for a user’s natural language prompt (“Find the number of trips completed yesterday in Seattle”) on schema samples (_CREATE TABLE…_) and SQL queries (_SELECT a, b, c FROM uber.foo …_) doesn’t return relevant results.

### Understanding User’s Intent

Another issue we found was that it’s incredibly challenging to go from a user’s natural language prompt to finding the relevant schemas.
What we needed was an intermediate step, which classifies the user’s prompt into an “intent” that maps to relevant schemas and SQL samples.

### Handling Large Schemas

We have some really large schemas on some Tier 1 tables at Uber, with some spanning over 200 columns.
These large tables could use up as much as 40-60K tokens in the request object.
Having 3 or more of these tables would break the LLM call since the largest available model (at the time) only supported 32K tokens.

## Current Design

The diagram below shows the current design of QueryGPT that we’re running in production.
The current version includes many iterative changes from the first version.

<img src="/img/posts/uber-querygpt-img008.png" style="max-width:600px"/>

### Workspaces

In our current design, we introduced “workspaces,” which are curated collections of SQL samples and tables tailored to specific business domains such as Ads, Mobility, and Core Services.
These workspaces help narrow the focus for the LLM, improving the relevance and accuracy of generated queries.

We’ve identified some of the more common business domains inside Uber and created those in the backend as “System Workspaces.”
Mobility is one of these system workspaces that we identified as foundational domains that could be used for query generation.

**_Mobility_** : Queries that include trips, driver, document details, etc.

> Write **a** query to find **the** number **of** trips that were completed **by** Teslas **in** Seattle yesterday

Along with these, we also shipped 11 other system workspaces, including “Core Services,” “Platform Engineering,” “IT,” “Ads,” etc.

We also included a feature that allows users to create “Custom Workspaces” if none of the existing system workspaces fit their requirement and use those for query generation.

### Intent Agent

Every incoming prompt from the user now first runs through an “intent” agent.
The purpose of this intent agent is to map the user’s question to one or more business domains/workspaces (and by extension a set of SQL samples and tables mapped to the domain).
We use an LLM call to infer the intent from the user question and map these to “system” workspaces or “custom” workspaces.

Picking a business domain allowed us to drastically narrow the search radius for RAG.

### Table Agent

Allowing users to select the tables used in the query generation came up as feedback from some users who saw that the tables that were eventually picked by QueryGPT were not correct.

To address this feedback, we added another LLM agent (Table Agent) that would pick the right tables and send those out to the user to either “ACK” or edit the given list and set the right tables.
A screenshot of what the user would see is shown below:

<img src="/img/posts/uber-querygpt-img009.png" style="max-width:600px"/>

The user would either select the “Looks Good” button or edit the existing list and modify the list of tables to be used by the LLM for query generation.

### Column Prune Agent

Another interesting issue we ran into after rolling QueryGPT out to a larger set of users was the “intermittent” token size issue during query generation for some requests.
We were using the OpenAI GPT-4 Turbo model with 128K token limit (1106), but were still seeing token limit issues because some requests included one or more tables that each consumed a large amount of tokens.

To address this issue, we implemented a “Column Prune” agent, wherein we use an LLM call to prune the irrelevant columns from the schemas we provided to the LLM.

Here’s what the output from the agent looks like:

<img src="/img/posts/uber-querygpt-img010.png" style="max-width:600px"/>

The output would include a skinnier version of each schema that we needed for query generation.
This change massively improved not just the token size and by extension the cost of each LLM call, but also reduced the latency since the input size was much smaller.

### Output

No changes were made to the output structure with the current design.
The response would include a SQL Query and an explanation from the LLM about how the query was generated similar to what’s shown in Figure 7.

## Evaluation

To track incremental improvements in QueryGPT’s performance, we needed a standardized evaluation procedure.
This enabled us to differentiate between repeated vs. anomalous shortcomings of the service and ensure algorithm changes were incrementally improving performance in aggregate. 

### Evaluation Set

Curating a set of golden question-to-SQL answer mappings for evaluation required manual upfront investment.
We identified a set of real questions from the QueryGPT logs, and manually verified the correct intent, schemas required to answer the question, and the golden SQL.
The question set covers a variety of datasets and business domains. 

### Evaluation Procedure

We developed a flexible procedure that can capture signals throughout the query generation process in production and staging environments using different product flows: 

| Product Flow | Purpose | Procedure
|---|---|---
| Vanilla | Measures QueryGPT’s baseline performance. | Input a question.QueryGPT infers the intent and datasets needed to answer the question.Generate the SQL using inferred datasets and intent.Evaluate intent, datasets, and SQL.
| Decoupled | Measures QueryGPT performance with the human-in-the-loop experience. Enables component-level evaluation by removing dependencies on performance on earlier outcomes. | Input a question, intent, and datasets needed to answer the question.QueryGPT infers the intent and datasets.Generate the SQL using the actual (not inferred) intent and datasets. Evaluate intent, datasets, and SQL.

For each question in the evaluation, we capture the following signals:

**Intent**: Is the intent assigned to the question as accurate? 

**Table Overlap**: Are the tables identified via Search + Table Agent correct?
This is represented as a score between 0 and 1.
For example, if the query needed to answer the questions “How many trips were canceled by drivers last week in Los Angeles?” required the use of [_fact_trip_state_, _dim_city_], and QueryGPT identified [_dim_city_, _fact_eats_trip_], the Search Overlap Score for this output would be 0.5, because one of the two tables required to answer the question was selected.

**Successful Run**: Does the generated query run successfully?

**Run Has Output**: Does the query execution return > 0 records.
(Sometimes, QueryGPT hallucinates filters like WHERE status = “Finished” when, the filter should have been WHERE status = “Completed” resulting in a successful run with no output).

**Qualitative Query Similarity**: How similar is the generated query relative to the golden SQL?
We use an LLM to assign a similarity score between 0 and 1.
This allows us to quickly see if a generated query that is failing for a syntactic reason is on the right track in terms of columns used, joins, functions applied, etc.

We visualize progress over time to identify regressions and patterns revealing areas for improvement.

The figure below is an example of question-level run results enabling us to see repeated shortcomings at individual question level.

<img src="/img/posts/uber-querygpt-img011-1.png" style="max-width:180px"/>

<img src="/img/posts/uber-querygpt-img011-2.png" style="max-width:600px"/>

For each question, we can view the generated SQL, reason for the error, and related performance metrics.
Below is a question whose generated query is regularly failing because it is not applying a partition filter in the where clause.
However, according to the qualitative LLM-based evaluation, the generated SQL is otherwise similar to the golden SQL. 

<img src="/img/posts/uber-querygpt-img012.png" style="max-width:600px"/>

We also aggregate accuracy and latency metrics for each evaluation run to track performance over time. 

<img src="/img/posts/uber-querygpt-img013.png" style="max-width:600px"/>

### Limitations

Due to the non-deterministic nature of LLMs, running the same evaluation with no changes to the underlying QueryGPT service can result in different outcomes.
In general, we do not over-index decisions based on ~5% run-to-run changes in most metrics.
Instead, we identify error patterns over longer time periods that can be addressed by specific feature improvements.

Uber has hundreds of thousands of datasets with varying levels of documentation.
Thus, it is impossible for the set of evaluation questions to fully cover the universe of business questions that a user may ask.
Instead, we curated a set of questions that represent the current usage of the product.
As we improve accuracy and new bugs arise, the evaluation set will evolve to capture the direction of the product. 

There is not always one correct answer.
Often, the same question could be answered by querying different tables or writing queries in different styles.
By visualizing the golden vs. returned SQL and using the LLM-based evaluation score, we can understand if the generated query is written in a different style, but has a similar intent related to the golden SQL.

## Learnings

Working with nascent technologies like GPTs and LLMs over the past year allowed us to experiment and learn a lot of different nuances of how agents and LLMs use data to generate responses to user questions.
We’ve briefly described below some of the learnings from our journey:

### LLMs are excellent classifiers

Our intermediate agents that we used in QueryGPT to decompose the user’s natural language prompt into better signals for our RAG improved our accuracy a lot from the first version and a lot of it was due to the fact that the LLMs worked really well when given a small unit of specialized work to do.

The intent agent, table agent, and column prune agent each did an excellent job because they were asked to work on a single unit of work rather than a broad generalized task.

### Hallucinations

This remains an area that we are constantly working on, but in a nutshell, we do see instances where the LLM would generate a query with tables that don’t exist or with columns that don’t exist on those tables.

We’ve been experimenting with prompts to reduce hallucinations, introduced a chat style mode where users can iterate on the generated query and are also looking to include a “Validation” agent that recursively tries to fix hallucinations, but this remains an area that we haven’t completely solved yet.

### User prompts are not always “context”-rich

Questions entered by the users in QueryGPT ranged from very detailed with the right keywords to narrow the search radius to a 5 word question (with typos) to answer a broad question that would require joins across multiple tables.

Solely relying on user questions as “good” input to the LLM caused issues with accuracy and reliability.
A “prompt enhancer” or “prompt expander” was needed to “massage” the user question into a more context-rich question before we sent those to the LLM.

### High bar for SQL output generated by the LLM

While this version of QueryGPT is helpful for a broad set of personas, there is definitely an expectation from many that the queries produced will be highly accurate and “just work.”
The bar is high! 

In our experience, we found that it was best to target and test with the right persona(s) as your initial user base when building a product like this.

# Conclusion

The development of QueryGPT at Uber has been a transformative journey, significantly enhancing productivity and efficiency in generating SQL queries from natural language prompts.
Leveraging advanced generative AI models, QueryGPT seamlessly integrates with Uber’s extensive data ecosystem, reducing query authoring time and improving accuracy, addressing both the scale and complexity of our data needs.

While challenges such as handling large schemas and reducing hallucinations persist, our iterative approach and constant learning have enabled continuous improvements.
QueryGPT not only simplifies data access but also democratizes it, making powerful data insights more accessible across various teams within Uber.

With our limited release to some teams in Operations and Support, we are averaging about 300 daily active users, with about 78% saying that the generated queries have reduced the amount of time they would’ve spent writing it from scratch.

As we look forward, the integration of more sophisticated AI techniques and user feedback will drive further enhancements, ensuring that QueryGPT remains a vital tool in our data platform.

</div>
</details>

---

References
- [QueryGPT – Natural Language to SQL Using Generative AI \| Uber Blog](https://www.uber.com/en-KR/blog/query-gpt/?uclick_id=fd995b6c-c3ef-4810-b3ee-b24b40381a28){:target="_blank"}
