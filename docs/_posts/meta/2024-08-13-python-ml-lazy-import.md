---
layout: post
title: "[번역] Lazy Import와 Cinder가 머신러닝 성능을 이끌어낸 방법"
excerpt: 머신러닝 세계에서 시간은 곧 생명입니다. 머신러닝 모델이 초기 학습 데이터를 처리하는 과정에서 소요되는 1밀리초의 차이는 생산성과 실험 과정에 아주 극명한 차이를 가져올 수 있습니다. 메타에서는 Lazy Imports 방식과 파이썬 런타임 Cinder를 도입하면서
category: meta engineering
tags:
  - python
  - machine learning
  - lazy import
thumbnail: "/img/thumbnails/meta-ml-lazy-import.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Lazy is the new fast: How Lazy Imports and Cinder accelerate machine learning at Meta](https://engineering.fb.com/2024/01/18/developer-tools/lazy-imports-cinder-machine-learning-meta/) 포스트를 번역한 글입니다.
> 
> 게시일: 2024.01.18

# 느릿한 것이 또 다른 빠름이다: Lazy Import와 Cinder가 머신러닝 성능을 이끌어낸 방법

머신러닝 세계에서 시간은 곧 생명입니다.
머신러닝 모델이 초기 학습 데이터를 처리하는 과정에서 소요되는 1밀리초의 차이는 생산성과 실험 과정에 아주 극명한 차이를 가져올 수 있습니다.

메타에서는 [Lazy Imports](https://peps.python.org/pep-0690/) 방식과 파이썬 런타임 [Cinder](https://github.com/facebookincubator/cinder)를 도입하면서 모델의 학습 시간을 개선했을 뿐 아니라 전반적인 개발자 경험(DevX)도 축적할 수 있었습니다.

## 첫 배치 시간 이슈

배치 프로세싱 기법은 머신러닝의 판도를 바꾸어 놓았습니다.
덕분에 많은 양의 데이터를 그룹(또는 배치) 단위로 다루면서 모델을 학습시키고 파라미터를 최적화하며 추론 과정을 보다 신속하고 효과적으로 수행할 수 있게 되었습니다.

하지만 머신러닝 작업은 느려 터지기로 악명이 높습니다.
우리는 배치 처리 속도를 개선하기 위해서 TTFB(Time to first batch, 첫 배치 시간)에 주목했습니다.
TTFB란 머신러닝 모델을 학습시키기 위해 "시작" 버튼을 누른 후 첫 번째 배치 데이터가 모델이 입력되기까지의 경과 시간을 의미합니다.
해당 값은 모델의 학습이 진행되는 속도를 결정하는 핵심적인 지표로, 인프라의 오버헤드나 스케줄링 지연과 같은 여러 요인에 따라 천차만별일 수 있습니다.
결국 TTFB를 줄인다는 건 엔지니어에게 지루할 수 있는 개발 대기 시간 단축을 의미하게 되며, 이러한 대기 시간이 길어질수록 많은 리소스가 낭비될 수 있습니다.

좀 더 짧은 TTFB를 위해 메타는 이러한 오버헤드를 줄이는 것을 목표로 삼았고, Lazy Imports와 Cinder가 새로운 해결책으로 부상했습니다.

## Lazy Imports의 마법

이전까지 머신러닝 개발자들은 표준 라이브러리 `importlib`의 `LazyLoader`나 `lazy-import` 같은 대안을 모색하며 명시적으로 import 작업을 늦추었습니다.
이러한 접근법은 유용해 보였지만 적용할 수 있는 범위가 좁아서 제한적이었고, 매번 어떤 의존성을 지연시킬지 선택해야 했으며, 그나마도 어떤 경우에는 성능이 좋지도 않았습니다.
이 방식을 계속 가져가려면 세심한 코드베이스 관리와 상당한 양의 코드 리팩토링이 필요했습니다.

반면 [Cinder의 Lazy Imports](/docs/meta-cinder-lazy-import)의 접근 방식은 이러한 라이브러리의 한계를 뛰어넘고 개발자 경험을 크게 향상시키는 포괄적이면서도 과감한 전략입니다.
지연시킬 패키지를 수기로 일일이 선택하는 대신, Cinder는 기본적으로 모든 import 작업을 늦추어서 시작 프로세스를 경량화하고 가속하였으며, 결과적으로 패키지가 필요한 순간까지 더 광범위하고 강력하게 지연됩니다. 
이 방법을 사용하면 개발자는 import 패키지 선택의 굴레에서 벗어날 수 있습니다.
또한 typing 전용 작업이나 `TYPE_CHECKING` 과정도 필요 없어집니다.
파일 시작 부분에서 `from __future__ import annotations`를 명시함으로써 타입 평가를 지연시키고, Lazy Imports는 해당 모듈이 실제로 필요한 부분까지 import 작업을 늦추게 됩니다.
이러한 최적화를 결합하면 비용이 많이 드는 런타임 import를 줄이고 개발 작업이 더욱 간소화됩니다.

Lazy Imports 방식의 효과는 다음과 같습니다.
Meta는 머신러닝 개발을 개선하기 위해 Lazy Imports와 Cinder를 여러 작업에 도입하였으며, 여기에는 우리의 머신러닝 프레임워크와 Jupyter 커널도 포함되어 있습니다.
그 결과, 매우 빠른 시작 시간, 향상된 실험 능력, 감소한 인프라 오버헤드, 그리고 유지 보수하기 간편한 코드를 얻을 수 있었습니다.
우리는 메타의 주요 인공지능 작업에서 TTFB값이 최대 40%까지 개선되는 등 눈부신 성과를 공유할 수 있어서 벅차게 생각하고 있습니다.
이렇게 절약한 시간은 매 실행마다 몇 초에서 몇 분 단위로 다양하게 나타날 수 있습니다.

이렇게 놀라운 결과는 머신러닝 개발자가 모델 학습 단계에 좀 더 빠르게 도달할 수 있다는 의미로 머신러닝 작업의 효율성을 크게 향상시킵니다.

## Lazy Imports 채택

Lazy Imports를 사용하면서 머신러닝 개발 과정을 상당히 개선하였지만, 처음부터 모든 것이 순탄하지만은 않았습니다.
우리의 의지와 창의성을 시험하는 몇 가지 어려움이 있었습니다.

### 호환성

가장 고심했던 부분은 기존 라이브러리와 Lazy Imports 간의 호환성이었습니다.
PyTorch나 Numba, Numpy, SciPy 혹은 다른 라이브러리는 모듈을 지연시켜서 불러오는 방식과는 잘 어우러지지 않았습니다.
이런 라이브러리는 import 사이드 이펙트 및 Lazy Imports와 잘 작동하지 않는 다른 패턴의 영향을 받았습니다.
구체적으로 파이썬이 모듈을 가져오는 순서가 바뀌거나 늦춰질 수 있어서 클래스나 함수 및 연산 작업이 올바르게 등록되지 않는 상황이 종종 발생했습니다.
이런 상황을 해결하기 위해 import 사이클과 어긋난 부분을 식별하고 처리하는 데 많은 공을 들여야 했습니다.

### 성능과 신뢰성 사이의 균형

우리는 또한 성능 최적화와 코드 신뢰성 사이에서 타협해야만 했습니다.
Lazy Imports가 TTFB를 꽤 줄여주었고 리소스 투입량을 개선한 건 자명하지만, 파이썬 라이브러리를 불러오는 구문에서 상당한 의미론적 변화가 이루어졌기 때문에 코드베이스가 덜 직관적으로 보일 수 있습니다.
두 가치가 완벽하게 조화를 이루도록 지속적으로 고려하였고, 철저하게 테스트 가능한 부분으로만 의미 변화의 영향을 제한하면서 신뢰성을 보장하였습니다.

기존 코드베이스와 원활한 상호작용을 보장하려면 세심한 검증과 조정이 필요합니다.
복합적이고 다방면에 걸친 머신러닝 모델을 다루는 경우에는 일이 더 복잡해졌는데, 지연된 import의 영향을 철저하게 고려해야만 했습니다.
결론적으로 우리는 Lazy Imports를 초기 및 준비 단계에서 활성화하고 첫 배치가 시작되기 전에 종료되도록 하였습니다.

### 러닝 커브

Lazy Imports와 같은 새로운 패러다임을 적용하다 보면 개발팀에게 러닝 커브가 발생할 수 있습니다.
머신러닝, 인프라 및 시스템 엔지니어들이 새로운 방식에 숙달하면서 구문의 뉘앙스를 이해하고 효과적으로 구현하는 건 그 자체로 일이 됩니다.

## 메타에서 Lazy Imports의 미래

Lazy Imports와 Cinder를 도입함으로써 메타의 인공지능 핵심 작업에서 의미 있는 발전이 나타났습니다.
때때로 기복이 있어 보였지만 궁극적으로 Lazy Imports 방식이 머신러닝의 새로운 혁신을 일으킬 것임을 보여주었습니다.
TTFB의 성공, 개발자들의 경험 개선, 커널 시간 단축은 이러한 출발의 가시적인 결과입니다.
Lazy Imports를 사용하면서 메타의 머신러닝 개발자들은 효율적으로 작업하고, 더 빠르게 시도하며, 신속한 결과를 얻을 수 있는 준비가 되어있습니다.

우리가 Lazy Imports를 적용하면서 좋은 성과를 거두었지만, 여전히 아직 갈 길이 멉니다.
앞으로 우리의 행보는 어떻게 될까요?
아래에 우리가 신경 쓰고 있는 몇 가지 부분을 맛보기로 보여드리겠습니다.

### 개발자 온보딩 효율화

Lazy Imports에 대한 러닝 커브는 새로 합류한 사람들에게 장벽이 될 수 있습니다.
우리는 개발자들이 이러한 혁신적인 방식을 쉽게 수용할 수 있도록 교육 리소스와 온보딩 자료에 신경 쓰고 있습니다.

### 개선된 도구

모듈 import가 지연된 상태에서는 코드 디버깅이 복잡해질 수 있습니다.
우리는 디버깅 프로세스를 간소화하는 도구나 기술을 제작하여 개발자들이 문제를 쉽게 발견하고 해결할 수 있도록 노력하고 있습니다.

### 커뮤니티와 협력

Lazy Imports의 진정한 힘은 유연성과 다재다능함에 있습니다.
우리는 파이썬 커뮤니티와 협력하여 통찰력과 모범 사례를 공유하고 함께 문제를 해결하고자 합니다.
Lazy Imports와 맞물리는 패러다임과 패턴을 지지하는 견고한 커뮤니티를 구축하는 것이 우리의 미래 우선 과제 중 하나입니다.

---

# Lazy is the new fast: How Lazy Imports and Cinder accelerate machine learning at Meta

Time is of the essence in the realm of machine learning (ML) development.
The milliseconds it takes for an ML model to transition from conceptualization to processing the initial training data can dramatically impact productivity and experimentation.

At Meta, we’ve been able to significantly improve our model training times, as well as our overall developer experience (DevX) by adopting [Lazy Imports](https://peps.python.org/pep-0690/) and the [Python Cinder runtime](https://github.com/facebookincubator/cinder). 

## The time to first batch challenge

Batch processing has been a game changer in ML development.
It handles large volumes of data in groups (or batches) and allows us to train models, optimize parameters, and perform inference more effectively and swiftly.

But ML training workloads are notorious for their sluggish starts.
When we look to improve our batch processing speeds, time to first batch (TTFB) comes into focus.
TTFB is the time elapsed from the moment you hit the “start” button on your ML model training to the point when the first batch of data enters the model for processing.
It is a critical metric that determines the speed at which an ML model goes from idle to learning.
TTFB can vary widely due to factors like infrastructure overhead and scheduling delays.
But reducing TTFB means reducing the development waiting times that can often feel like an eternity to engineers – waiting periods that can quickly amass as expensive resource wastage.

In the pursuit of faster TTFB, Meta set its sights on reducing this overhead, and Lazy Imports with Cinder emerged as a promising solution.

## The magic of Lazy Imports

Previously, ML developers explored alternatives like the standard `LazyLoader` in `importlib` or lazy-import`, to defer explicit imports until necessary.
While promising, these approaches are limited by their much narrower scope, and the need to manually select which dependencies will be lazily imported (often with suboptimal results).
Using these approaches demands meticulous codebase curation and a fair amount of code refactoring.

In contrast, [Cinder’s Lazy Imports](https://developers.facebook.com/blog/post/2022/06/15/python-lazy-imports-with-cinder/) approach is a comprehensive and aggressive strategy that goes beyond the limitations of other libraries and delivers significant enhancements to the developer experience.
Instead of painstakingly handpicking imports to become lazy, Cinder simplifies and accelerates the startup process by transparently deferring all imports as a default action, resulting in a much broader and more powerful deferral of imports until the exact moment they’re needed.
Once in place, this method ensures that developers no longer have to navigate the maze of selective import choices.
With it, developers can bid farewell to the need of typing-only imports and the use of `TYPE_CHECKING`.
It allows a simple `from __future__ import annotations` declaration at the beginning of a file to delay type evaluation, while Lazy Imports defer the actual import statements until required.
The combined effect of these optimizations reduced costly runtime imports and further streamlined the development workflow.

The Lazy Imports solution delivers.
Meta’s initiative to enhance ML development has involved rolling out Cinder with Lazy Imports to several workloads, including our ML frameworks and Jupyter kernels, producing lightning-fast startup times, improved experimentation capabilities, reduced infrastructure overhead, and code that is a breeze to maintain.
We’re pleased to share that Meta’s key AI workloads have experienced noteworthy improvements, with TTFB wins reaching up to 40 percent.
Resulting time savings can vary from seconds to minutes per run.

These impressive results translate to a substantial boost in the efficiency of ML workflows, since they mean ML developers can get to the model training phase more swiftly.

## The challenges of adopting Lazy Imports

While Lazy Imports’ approach significantly improved ML development, it was not all a bed of roses.
We encountered several hurdles that tested our resolve and creativity.

### Compatibility

One of the primary challenges we grappled with was the compatibility of existing libraries with Lazy Imports.
Libraries such as PyTorch, Numba, NumPy, and SciPy, among others, did not seamlessly align with the deferred module loading approach.
These libraries often rely on import side effects and other patterns that do not play well with Lazy Imports.
The order in which Python imports could change or be postponed, often led to side effects failing to register classes, functions, and operations correctly.
This required painstaking troubleshooting to identify and address import cycles and discrepancies.

### Balancing performance versus dependability

We also had to strike the right balance between performance optimization and code dependability.
While Lazy Imports significantly reduced TTFB and enhanced resource utilization, it also introduced a considerable semantic change in the way Python imports work that could make the codebase less intuitive.
Achieving the perfect equilibrium was a constant consideration, and was ensured by limiting the impact of semantic changes to only the relevant parts that could be thoroughly tested.

Ensuring seamless interaction with the existing codebase required meticulous testing and adjustments.
The task was particularly intricate when dealing with complex, multifaceted ML models, where the implications of deferred imports needed to be thoroughly considered.
We ultimately opted for enabling Lazy Imports only during the startup and preparation phases and disabling it before the first batch started.

### Learning curve

Adopting new paradigms like Lazy Imports can introduce a learning curve for the development team.
Training ML engineers, infra engineers, and system engineers to adapt to the new approach, understand its nuances, and implement it effectively is a process in itself.

## What is next for Lazy Imports at Meta?

The adoption of Lazy Imports and Cinder represented a meaningful enhancement in Meta’s AI key workloads.
It came with its share of ups and downs, but ultimately demonstrated that Lazy Imports can be a game changer in expediting ML development.
The TTFB wins, DevX improvements, and reduced kernel startup times are all tangible results of this initiative.
With Lazy Imports, Meta’s ML developers are now equipped to work more efficiently, experiment more rapidly, and achieve results faster.

While we’ve achieved remarkable success with the adoption of Lazy Imports, our journey is far from over.
So, what’s next for us?
Here’s a glimpse into our future endeavors:

### Streamlining developer onboarding
The learning curve associated with Lazy Imports can be a challenge for newcomers.
We’re investing in educational resources and onboarding materials to make it easier for developers to embrace this game-changing approach. 

### Enhancing tooling

Debugging code with deferred imports can be intricate.
We’re working on developing tools and techniques that simplify the debugging and troubleshooting process, ensuring that developers can quickly identify and resolve issues.

### Community collaboration

The power of Lazy Imports lies in its adaptability and versatility.
We’re eager to collaborate with the Python community – sharing insights, best practices, and addressing challenges together.
Building a robust community that helps supporting paradigms and patterns that play well with Lazy Imports is one of our future priorities.

---

References

- [Lazy is the new fast: How Lazy Imports and Cinder accelerate machine learning at Meta - Engineering at Meta](https://engineering.fb.com/2024/01/18/developer-tools/lazy-imports-cinder-machine-learning-meta/)
