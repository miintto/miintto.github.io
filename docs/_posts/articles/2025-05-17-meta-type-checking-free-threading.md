---
layout: post
title: "[번역] 타입 체킹과 Free Threading으로 파이썬 생태계 개선"
category: articles
tags:
  - python
  - type
  - free threading
toc: true
thumbnail: "/img/thumbnails/meta-type-checking-free-threading.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Enhancing the Python ecosystem with type checking and free threading](https://engineering.fb.com/2025/05/05/developer-tools/enhancing-the-python-ecosystem-with-type-checking-and-free-threading/){:target="_blank"} 포스트를 번역한 글입니다.
> 
> 게시일: 2025.05.05

---

# 타입 체킹과 Free Threading으로 파이썬 생태계 개선

이번에는 파이썬 생태계에서 패키지 속도와 사용성을 개선한 두 가지 성과에 집중해 보겠습니다.

- 🚀 Free-Threaded Python으로 성능 극대화 – 동시성 프로그래밍을 위한 파이썬 3.13 서포트 및 GIL(Global Interpreter Lock) 제거
- ✅ 타입 어노테이션(type annotation) 개선으로 IDE를 사용하는 개발자 생산성 향상

## 데이터 사이언스 분야에서 타입 개선

파이썬 3.5 버전부터 [PEP-484](https://peps.python.org/pep-0484/){:target="_blank"}의 제안으로 타입 힌트가 도입되면서 개발자들은 다양한 타입을 명시할 수 있었고, 덕분에 런타임 실행에 영향을 주지 않으면서 가독성을 높일 수 있었습니다.
또한 타입 체커는 이러한 어노테이션을 검증하면서 버그를 방지하고 자동완성이나 메소드 이동과 같은 IDE 기능을 개선하였습니다.
하지만 이러한 장점에도 불구하고 타입 어노테이션이 오픈소스 생태계에 일관성 없이 스며들면서 타입을 관리하는 무수한 사용 사례가 생겨나게 되었습니다.

현재 오픈소스 소프트웨어 생태계 현황을 살펴보면 타입 어노테이션을 정의하고 유지보수 및 최종 사용자에게 제공하는 방법이 다소 혼재되어 있습니다.
일부 프로젝트에서는 인라인 어노테이션(타입을 소스코드에 직접 선언하는 방식)으로 작성하고 있으며, 몇 프로젝트는 별도 스텁(stub) 파일에서 타입을 관리하며, 대다수의 프로젝트는 아예 타입을 제공하지 않고 [typeshed](https://github.com/python/typeshed){:target="_blank"}와 같은 써드 파티 라이브러리에 의존합니다.
각 방식은 저마다의 장단점이 있지만 전반적으로 [일관성이 떨어져서 혼란한 상태입니다](https://discuss.python.org/t/prevalence-staleness-of-stubs-packages-in-pypi/70457){:target="_blank"}.

Meta와 Quansight에서는 이러한 문제를 아래와 같이 해결하고 있습니다.

1. **직접 개선**: 파이썬 패키지 pandas-stubs와 numpy의 타입 커버리지를 직접 개선하였으며, 다른 패키지까지 확장할 계획입니다.
2. **커뮤니티 참여 유도**: 더 많은 커뮤니티가 참여할 수 있도록 타입 어노테이션을 장려하고, 피드백에 귀 기울이며 개선점을 찾기 위해 노력하고 있습니다.
3. **도구 및 자동화**: 공통적인 문제를 해결하기 위해 별도 도구를 제작하여 타입을 추가하고 소스 코드의 타입을 최신으로 유지하였습니다.

## Pandas 타입 어노테이션 개선

한 줄 요약: _pandas는 데이터 사이언스 분야에서 두 번째로 다운로드 수가 많은 파이썬 패키지인데,
우리는 [pandas-stubs](https://github.com/pandas-dev/pandas-stubs/){:target="_blank"} 패키지의 타입 커버리지를 기존 36%에서 50% 이상으로 끌어올렸습니다._

### 배경

pandas는 독립된 레포지토리에서 스텁(stub)을 관리하고 있으며, 타입 어노테이션을 위해서는 해당 라이브러리를 별도로 설치해야 합니다.
이런 스텁 파일들은 실제 소스 코드와는 독립적으로 관리되고 있지만, 커뮤니티에서는 이 타입 정보를 가져와 타입 검사나 IDE 기능으로 활용할 수 있습니다.

### 타입 커버리지 확대

최초 작업 시점에 pandas-stubs의 파라미터, 반환 값, 속성 중에서 타입 어노테이션이 완벽히 작성된 항목의 비율을 측정해 보았더니 약 36% 커버리지에 불과했습니다.
그리고 몇 주 동안 작업을 진행하며 약 30개의 PR을 처리했고, 다시 커버리지를 측정해 보았더니 50% 이상으로 나타났습니다.
주된 작업 내용은 타입이 누락된 파라미터에 타입 어노테이션 추가, raw generic 타입에 타입 인자 추가, deprecated 되거나 문서화되지 않은 인터페이스를 제거하는 것이었습니다.
또한 잘못 작성된 어노테이션을 일부 개선하였으며, 몇몇 타입은 pandas 소스 코드에 기재된 어노테이션과 일치하도록 조정하였습니다.

### 주요 작업

다음 두 가지 작업으로로 커버리지를 상당히 높일 수 있었습니다.

- `Series[Any]`에 alias를 붙인 `UnknownSeries` 타입을 새로 정의하여 raw `Series` 타입을 대체하였습니다. 해당 어노테이션을 반환 타입에 적용하면서 함수 호출 시 타입 검증 과정에서 많은 false-positive를 줄일 수 있었습니다.
- Dataframe에서 insert, combine, replace, transpose와 같은 핵심 연산 작업과 timestamp 및 time-zone 관련 API의 타입을 개선하였습니다.

### 도구의 발전

직접 커버리지를 올리는 방법 외에도, 어노테이션이 누락된 퍼블릭 인터페이스를 잡아내어 목록화하는 도구를 제작하였습니다.
또한 타입 어노테이션이 코어 라이브러리 wheel에 포함되지 않고 별도 스텁으로 분리된 경우에도 커버리지가 잘 측정되도록 보완했습니다.

## Free-Threaded Python이란?

Free-Threaded Python(FTP)은 VM에서 병렬로 여러 스레드를 사용할 수 있도록 고안한 실험적인 CPython 빌드입니다.
기존에는 GIL이 여러 스레드가 동시에 VM에 접근하는 것을 제한하고 있었기 때문에 실행 중인 스레드 작업을 순차적으로 처리해야만 했습니다.
이제 GIL이 선택 값이 된다면 개발자의 취사선택에 따라 멀티 코어의 장점을 최대한 살려 온전한 병렬 실행이 가능하게 될 것입니다.

### Free-Threaded Python의 장점

Free-Threaded Python의 장점은 무수히 많습니다.

1. **단일 프로세스에서 온전한 병렬 처리**: GIL을 걷어낸다면 멀티 프로세스 없이도 멀티 프로세서를 활용한 파이썬 코드를 작성할 수 있습니다. 즉 CPU 중심 작업도 여러 코어에서 병렬로 실행할 수 있습니다.
2. **성능 향상**: 여러 스레드에서 파이썬 코드를 동시에 병렬 실행이 가능하다면 단일 프로세스에서도 작업을 여러 스레드에 효율적으로 분배할 수 있습니다.
3. **간소화된 동시성**: Free-threading으로 개발자들은 파이썬 병렬 프로그램을 더 쉽게 작성할 수 있습니다. 이제는 `multiprocessing.Pool`을 사용할 필요가 없으며, 여러 프로세스 간에 데이터를 효율적으로 공유하기 위한 커스텀 공유 메모리 구조도 필요 없어지게 됩니다.

### FTP를 위해 준비된 파이썬 생태계

Free-Threaded Python이 실질적으로 사용되려면 기존 파이썬 패키지가 문제없이 호환되어야만 합니다.
누군가 free-threading 기능을 사용하고 싶어도 의존성 라이브러리가 지원하지 않는다면 결국 사용할 수 없게 됩니다.
그래서 우리는 핵심부터 접근하여 가장 까다롭거나 인기 있는 패키지를 우선적으로 지원하는 전략을 취하였습니다.
현재까지 데이터 사이언스 분야에 대중적으로 사용되는 패키지(ex. numpy, scipy, scikit-learn 등)나 language binding 기능(ex. Cython, nanobind, pybind, PyO3 등)에 [free-threading을 지원하고 있습니다](https://py-free-threading.github.io/tracking/){:target="_blank"}.

## 이제 시작입니다

우리의 노력으로 파이썬 라이브러리의 free-threading 호환성과 타입 어노테이션 발전을 이끌어냈습니다.
이러한 성과는 파이썬 커뮤니티의 도움 없이는 불가능했으며, 더 많은 구성원에게도 우리의 노력에 동참해 달라고 요청하고 있습니다.
[타입 어노테이션에 대한 추가 개선](https://discuss.python.org/t/call-for-suggestions-nominate-python-packages-for-typing-improvements/80186){:target="_blank"}이나 [FTP를 대비한 코드](https://py-free-threading.github.io/porting/){:target="_blank"}라든지 파이썬을 한 단계 발전시키는 데 도움을 주신다면 감사하겠습니다.

Meta의 오픈소스에 대해 더 궁금한 점이 있으시다면 저희 [오픈소스 사이트](https://opensource.fb.com/){:target="_blank"}를 방문해 주시거나 [유튜브 채널](https://www.youtube.com/channel/UCCQY962PmHabTjaHv2wJzfQ){:target="_blank"} 구독 혹은 [페이스북](https://www.facebook.com/MetaOpenSource){:target="_blank"}, [Threads](https://www.threads.com/@metaopensource){:target="_blank"}, [X](https://x.com/MetaOpenSource){:target="_blank"}, [LinkedIn](https://www.linkedin.com/showcase/meta-open-source?fbclid=IwZXh0bgNhZW0CMTEAAR2fEOJNb7zOi8rJeRvQry5sRxARpdL3OpS4sYLdC1_npkEy60gBS1ynXwQ_aem_mJUK6jEUApFTW75Emhtpqw){:target="_blank"}을 팔로우 부탁드립니다.

---

<details>
<summary>원문 보기</summary>
<div markdown="1">

# Enhancing the Python ecosystem with type checking and free threading

We’ll look at two key efforts in Python’s packaging ecosystem to make packages faster and easier to use:

- 🚀 Unlock performance wins for developers through free-threaded Python – where we leverage Python 3.13’s support for concurrent programming (made possible by removing the Global Interpreter Lock (GIL)).
- ✅ Increase developer velocity in the IDE with improved type annotations.


## Enhancing typed Python in the Python scientific stack

Type hints, introduced in Python 3.5 with [PEP-484](https://peps.python.org/pep-0484/){:target="_blank"}, allow developers to specify variable types, enhancing code understanding without affecting runtime behavior.
Type-checkers validate these annotations, helping prevent bugs and improving IDE functions like autocomplete and jump-to-definition.
Despite their benefits, adoption is inconsistent across the open source ecosystem, with varied approaches to specifying and maintaining type annotations.

The landscape of open source software is fractured with respect to how type annotations are specified, maintained, and distributed to end users.
Some projects have in-line annotations (types directly declared in the source code directly), others keep types in stub files, and many projects have no types at all, relying on third party repositories such as [typeshed](https://github.com/python/typeshed){:target="_blank"} to provide community-maintained stubs.
Each approach has its own pros and cons, but application and maintenance of them [has been inconsistent](https://discuss.python.org/t/prevalence-staleness-of-stubs-packages-in-pypi/70457){:target="_blank"}.

Meta and Quansight are addressing this inconsistency through:

1. **Direct contributions**: We have improved the type coverage for pandas-stubs and numpy, and are eager to expand the effort to more packages.
2. **Community engagement**: Promoting type annotation efforts to encourage community involvement, listen to feedback and create actionable ways to improve the ecosystem.
3. **Tooling and automation**: Developing tools to address common challenges adding types and keeping the types up-to-date with the source code.

## Improved type annotations in pandas

TL;DR: _Pandas is the second most downloaded package from the Python scientific stack.
We improved [pandas-stubs](https://github.com/pandas-dev/pandas-stubs/){:target="_blank"} package type annotation coverage from 36% to over 50%._

### Background

The pandas community maintains its own stubs in a separate repository, which must be installed to obtain type annotations.
While these stubs are checked separately from the source code, it allows the community to use types with their own type checking and IDE.

### Improving type coverage

When we began our work in pandas-stubs, coverage was around 36%, as measured by the percentage of parameters, returns, and attributes that had a complete type annotation (the annotation is present and all generics have type arguments).
After several weeks of work and about 30 PRs, type completeness is now measured at over 50%.
The majority of our contributions involved adding annotations to previously-untyped parameters, adding type arguments to raw generic types, and removing deprecated/undocumented interfaces.
We also improved several inaccurate annotations and updated others to match the inline annotations in the pandas source code.

### Key introductions

Two key introductions significantly increased coverage:

- Replacing raw `Series` types with `UnknownSeries`, a new type aliased to `Series[Any]`. When applied to return type annotations, this reduces the number of type checker false-positives when the function is called.
- Improving types of core Dataframe operations like insert, combine, replace, transpose, and assign, as well as many timestamp and time-zone related APIs.

### Tooling development

In addition to improving coverage directly, we developed tooling to catalog public interfaces missing annotations.
We also augmented our tools for measuring type coverage to handle the situation where stubs are distributed independently, rather than being packaged into the core library wheel.

## What is free-threaded Python ?

Free-threaded Python (FTP) is an experimental build of CPython that allows multiple threads to interact with the VM in parallel.
Previously, access to the VM required holding the global interpreter lock (GIL), thereby serializing execution of concurrently running threads.
With the GIL becoming optional, developers will be able to take full advantage of multi-core processors and write truly parallel code.

### Benefits of free-threaded Python

The benefits of free-threaded Python are numerous:

- **True parallelism in a single process**: With the GIL removed, developers can write Python code that takes full advantage of multi-core processors without needing to use multiple processes. CPU-bound code can execute in parallel across multiple cores.
- **Improved performance**: By allowing multiple threads to execute Python code simultaneously, work can be effectively distributed across multiple threads inside a single process.
- **Simplified concurrency**: Free-threading provides developers with a more ergonomic way to write parallel programs in Python. Gone are the days of needing to use `multiprocessing.Pool` and/or resorting to custom shared memory data structures to efficiently share data between worker processes.

### Getting Python’s ecosystem ready for FTP

The ecosystem of Python packages must work well with free-threaded Python in order for it to be practically useful; application owners can’t use free-threading unless their dependencies work well with it.
To that end, we have been taking a “bottoms up” approach to tackle the most difficult/popular packages in the ecosystem.
[We’ve added free-threading support](https://py-free-threading.github.io/tracking/){:target="_blank"} to many of the most popular packages used for scientific computing (e.g. numpy, scipy, scikit-learn) and language bindings (e.g. Cython, nanobind, pybind, PyO3).

## Just getting started

Together, we made substantial progress in improving type annotations and free-threading compatibility in Python libraries.
We couldn’t have done it without the Python community and are asking others to join our efforts.
Whether it’s [further updates to the type annotations](https://discuss.python.org/t/call-for-suggestions-nominate-python-packages-for-typing-improvements/80186){:target="_blank"} or [preparing your code for FTP](https://py-free-threading.github.io/porting/){:target="_blank"}, we value your help moving the Python ecosystem forward!

To learn more about Meta Open Source, visit our [open source site](https://opensource.fb.com/){:target="_blank"}, subscribe to our [YouTube channel](https://www.youtube.com/channel/UCCQY962PmHabTjaHv2wJzfQ){:target="_blank"}, or follow us on [Facebook](https://www.facebook.com/MetaOpenSource){:target="_blank"}, [Threads](https://www.threads.com/@metaopensource){:target="_blank"}, [X](https://x.com/MetaOpenSource){:target="_blank"} and [LinkedIn](https://www.linkedin.com/showcase/meta-open-source?fbclid=IwZXh0bgNhZW0CMTEAAR2fEOJNb7zOi8rJeRvQry5sRxARpdL3OpS4sYLdC1_npkEy60gBS1ynXwQ_aem_mJUK6jEUApFTW75Emhtpqw){:target="_blank"}.

</div>
</details>

---

References

- [Enhancing the Python ecosystem with type checking and free threading - Engineering at Meta](https://engineering.fb.com/2025/05/05/developer-tools/enhancing-the-python-ecosystem-with-type-checking-and-free-threading/){:target="_blank"}
