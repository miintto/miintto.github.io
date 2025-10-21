---
layout: post
title: "[번역] Pyrefly 소개: 새로운 타입 체커로 체험하는 IDE 경험"
category: articles
tags:
  - python
  - type
  - pyrefly
toc: true
thumbnail: "/img/thumbnails/meta-pyrefly.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Introducing Pyrefly: A new type checker and IDE experience for Python](https://engineering.fb.com/2025/05/15/developer-tools/introducing-pyrefly-a-new-type-checker-and-ide-experience-for-python/){:target="_blank"} 포스트를 번역한 글입니다.
> 
> 게시일: 2025.05.15

---

# Pyrefly 소개: 새로운 타입 체커로 체험하는 IDE 경험

오늘 이 자리에서 [Rust](https://engineering.fb.com/2021/04/29/developer-tools/rust/){:target="_blank"}로 작성된 IDE 확장 도구 및 파이썬 타입 체커 [Pyrefly](https://pyrefly.org/){:target="_blank"}의 알파 버전을 공개하려고 합니다.
Pyrefly는 파이썬 코드를 분석하여 타입 일관성을 보장하며, 코드 실행 시 발생할 잠재적인 에러를 잡아내는 정적 타입체커입니다.
또한 IDE 통합 및 CLI 사용을 지원하여 사용자의 워크플로우 환경에 유연하게 적용할 수 있도록 하였습니다.

오픈소스 커뮤니티는 파이썬 언어의 중추적인 역할을 합니다.
우리는 Pyrefly가 커뮤니티와 협력하여 파이썬 타입 시스템과 많은 라이브러리를 개선하고자 합니다.

## 시작하기

모두 준비되었나요?
[공식 Pyrefly 웹사이트](https://pyrefly.org/){:target="_blank"}에서 자세한 설명을 확인할 수 있지만, 지금 이 자리에서는 빠르게 시작해 봅시다.

- 커맨드 라인으로 Pyrefly [설치](https://pyrefly.org/en/docs/installation/){:target="_blank"}: pip install pyrefly
- [기존 사용 중인 타입 체커 환경구성을 Pyrefly로 마이그레이션](https://pyrefly.org/en/docs/migrating-to-pyrefly/){:target="_blank"}.
- IDE 개선: [Pyrefly VSCode extension](https://marketplace.visualstudio.com/items?itemName=meta.pyrefly){:target="_blank"}을 설치하시면 더 가볍고 빠른 속도를 체험하실 수 있습니다.
- 추가적인 피드백은 [GitHub](https://github.com/facebook/pyrefly/issues){:target="_blank"}에 남겨주세요.

## Pyrefly를 제작한 이유

2017년 당시 우리는 파이썬으로 작성된 [인스타그램의 거대한 코드베이스](https://instagram-engineering.com/web-service-efficiency-at-instagram-with-python-4976d078e366){:target="_blank"}를 관리하기 위해 타입 체커가 절실한 상황이었습니다.
이에 따라 자체적인 타입 체커 [Pyre](https://github.com/facebook/pyre-check){:target="_blank"}를 제작하였는데, [Hack](https://hacklang.org/){:target="_blank"}과 [Flow](https://flow.org/){:target="_blank"}의 견고한 설계에서 영감을 받았으며 확장성 있는 성능을 위해 OCaml 언어로 작성하였습니다.

이후 수년 동안 Pyre 작동에는 아무 문제가 없었습니다.
하지만 타입 시스템이 점점 발전함에 따라 IDE가 지원하는 다양한 기능을 활용하기 위해 타입 체킹이 더욱 중요해졌으며, 타입 체커에 대해 새로운 접근 방식이 필요했습니다.
우리는 다른 대안을 찾아서 [Pyright](https://github.com/Microsoft/pyright){:target="_blank"}와 같은 외부 커뮤니티 도구를 활용하기도 했습니다.
하지만 코드 탐색, 대규모 코드베이스 검사, 다른 서비스로 타입을 내보내는 기능을 모두 지원하는 확장성 있는 타입 체커의 필요성을 느끼고 다시 개발을 시작하였으며, 결국 Pyrefly가 탄생했습니다.

## Pyrefly에 담긴 원칙

오늘 이 시간에 GitHub에서 [공개적으로 개발 중인](https://github.com/facebook/pyrefly){:target="_blank"} Pyrefly 프로젝트를 소개하게 되어 매우 기쁩니다.
저희의 작업물을 면밀히 살펴보시고 프로젝트에 적용해 보시길 부탁드립니다.
Pyrefly와 같은 프로젝트는 수천 가지 기술적인 선택이 녹아들어 있지만,  우리가 집중한 주요 원칙은 다음과 같습니다.

### 성능

우리는 CI 단계에서 진행되던 검사를 매 키 입력마다 수행하려고 합니다.
이를 위해서 빠른 속도로 코드를 검사해야 하며(대규모 코드베이스에서도 매 초마다 180만 줄의 코드를 검사할 수 있습니다.) 증분과 업데이트 처리에 대한 신중한 고려가 필요했습니다.
이에 따라 Pyrefly는 Rust로 작성되었으며 다양한 규모의 코드베이스에서 높은 성능을 발휘하도록 설계되었습니다.

### IDE 지원

우리는 IDE와 커맨드 라인이 서로 일관된 세계관을 공유하기를 바랍니다.
다시 말해 불필요한 비용을 들이지 않고 IDE와 명령어를 동시에 관리하는 추상화 계층을 설계해야 합니다.
이러한 추상화를 처음부터 설계하는 것은 기존 Pyre에 새로운 기능을 추가하는 것보다 훨씬 수월했습니다.

### 추론

몇몇 [파이썬 프로그램은 타입이 명시](/docs/meta-typed-python)되어 있지만 대다수는 그렇지 않습니다.
우리는 사용자들이 코드에 타입 힌트를 작성하지 않더라도 타입의 혜택을 볼 수 있기를 바랍니다.
그래서 메소드 반환 값이나 지역 변수의 타입을 자동으로 추론하고 IDE에 표시하도록 하였습니다.
더 나아가, 추론한 타입을 작성자의 취사선택에 따라 IDE에서 더블 클릭 한 번으로 코드에 손쉽게 추가할 수도 있습니다.

### 오픈소스

파이썬은 매우 인기 있는 오픈소스입니다.
[파이썬 타입 명세](https://typing.python.org/en/latest/spec/){:target="_blank"}도 오픈소스로 공개되어 있기 때문에 Pyrefly를 좀 더 수월하게 개발할 수 있었습니다.
이렇게 Meta가 참여한 많은 라이브러리(ex. [PyTorch](https://pytorch.org/){:target="_blank"})는 오픈소스로 공개되어 있습니다.

Pyrefly 또한 오픈소스로 공개되었으며 [GitHub](https://github.com/facebook/pyrefly/){:target="_blank"}에서 [MIT 라이선스](https://github.com/facebook/pyrefly/blob/main/LICENSE){:target="_blank"} 하에 이용하실 수 있습니다. 저희 [풀 리퀘스트(pull request)](https://github.com/facebook/pyrefly/pulls){:target="_blank"}와 [이슈 리포트(issue report)](https://github.com/facebook/pyrefly/issues){:target="_blank"}에 적극적인 참여 부탁드립니다.
또한 [디스코드 채널](https://discord.com/invite/Cf7mFQtW7W){:target="_blank"}도 준비되어 있으니 자유롭게 토론할 수도 있습니다.
저희는 Pyrefly 관련 커뮤니티를 구축하고자 합니다.

## Pyrefly의 미래

우리는 파이썬 커뮤니티와 협력하며 언어를 발전시키고 개발자들의 경험을 향상시키려고 합니다.
우리는 Pyre 코드베이스를 초기 단계부터 오픈소스로 공개하였고 타입 체커 작성자 커뮤니티와 함께 수많은 PEP에 참여하였습니다.
Pyrefly를 통해 파이썬 개발자들이 타입의 이점을 누릴 수 있도록 중요한 역할을 하길 바라며, 이를 통해 개발자를 포함하여 라이브러리 작성자, 파이썬을 처음 학습하는 사람들 모두 혜택을 받을 수 있습니다.

Meta는 오래전부터 동적 언어에서 타입을 활용하였으며, 이러한 타입이 개발자 생산성과 보안에 미치는 중요한 이점을 잘 알고 있습니다.
앞으로 우리는 더 많은 경험과 도구를 [블로그](/docs/meta-typed-python)에 게시하거나, 생태계 전반에 더 개선된 타입 지원, 파이썬 언어 개선 등을 통해 지속적으로 공유할 계획입니다.

오늘 Pyrefly 알파 버전을 릴리즈하였습니다.
동시에 올여름 알파 딱지를 떼기 위해 분주히 버그와 기능을 처리할 계획입니다.
여러분의 피드백 하나하나가 매우 소중하니, Pyrefly를 한번 사용해 보시고 [발견하신 버그](https://github.com/facebook/pyrefly/issues){:target="_blank"}나 개선 사항을 올려주세요.
Pyrefly를 프로젝트에 적용하기에 적합하지 않더라도, 타입을 사용하는 방식이나 사용하시는 에디터에 관련된 개선점을 파악하는 데 도움이 될 수 있습니다.

Pyrefly로 여러분의 버그를 잡아내는데 도움을 드릴테니 우리와 함께해주세요.
감사합니다. 🐍✨

## Pyrefly 더 알아보기

[Meta Tech 팟캐스트 에피소드](https://engineering.fb.com/2025/05/15/developer-tools/open-sourcing-pyrefly-a-faster-python-type-checker-written-in-rust/){:target="_blank"}에 들어오시면 저희 구성원들의 Pyrefly 제작기와 작동 방식에 대한 기술적인 세부 사항을 확인할 수 있습니다.
또한 [PyCon US 강연](https://us.pycon.org/2025/schedule/presentation/118/){:target="_blank"}에서 빠른 타입 체킹과 free threaded 실행을 활용한 고성능 파이썬에 대해 발표했습니다.

Meta의 오픈소스에 대해 더 궁금한 점이 있으시다면 저희 [오픈소스 사이트](https://opensource.fb.com/){:target="_blank"}를 방문해 주시거나 [유튜브 채널](https://www.youtube.com/channel/UCCQY962PmHabTjaHv2wJzfQ){:target="_blank"} 구독 혹은 [페이스북](https://www.facebook.com/MetaOpenSource){:target="_blank"}, [Threads](https://www.threads.com/@metaopensource){:target="_blank"}, [X](https://x.com/MetaOpenSource){:target="_blank"}, [LinkedIn](https://www.linkedin.com/showcase/meta-open-source?fbclid=IwZXh0bgNhZW0CMTEAAR2fEOJNb7zOi8rJeRvQry5sRxARpdL3OpS4sYLdC1_npkEy60gBS1ynXwQ_aem_mJUK6jEUApFTW75Emhtpqw){:target="_blank"}을 팔로우 부탁드립니다.

## 감사의 인사

Pyrefly는 Meta 파이썬 도구 지원팀에서 제작하였습니다.
다음과 같은 구성원이 참여하였습니다: Jia Chen, Rebecca Chen, Sam Goldman, David Luo, Kyle Into, Zeina Migeed, Neil Mitchell, Maggie Moss, Conner Nilsen, Aaron Pollack, Teddy Sudol, Steven Troxler, Lucian Wischik, Danny Yang, Sam Zhou.

---

<details>
<summary>원문 보기</summary>
<div markdown="1">

# Introducing Pyrefly: A new type checker and IDE experience for Python

Today we are announcing an alpha version of [Pyrefly](https://pyrefly.org/){:target="_blank"}, an open source Python type checker and IDE extension crafted in [Rust](https://engineering.fb.com/2021/04/29/developer-tools/rust/){:target="_blank"}.
Pyrefly is a static typechecker that analyzes Python code to ensure type consistency and help you catch errors throughout your codebase before your code runs.
It also supports IDE integration and CLI usage to give you flexibility in how you incorporate it into your workflow. 

The open source community is the backbone of the Python language.
We are eager to collaborate on Pyrefly with the community and improve Python’s type system and the many libraries that we all rely on.  

## Get started

Ready to dive in?
[The official Pyrefly website](https://pyrefly.org/){:target="_blank"} has all the details, but to quickly get started:

- [Install](https://pyrefly.org/en/docs/installation/){:target="_blank"} Pyrefly on the command-line: pip install pyrefly.
- [Migrate your existing type checker configuration to Pyrefly](https://pyrefly.org/en/docs/migrating-to-pyrefly/){:target="_blank"}.
- Enhance Your IDE: Download the [Pyrefly extension for VSCode](https://marketplace.visualstudio.com/items?itemName=meta.pyrefly){:target="_blank"} and enjoy a lightning fast IDE experience from starter projects to monorepos.
- Leave feedback for us on [GitHub](https://github.com/facebook/pyrefly/issues){:target="_blank"}.

## Why we built Pyrefly

Back in 2017, we embarked on a mission to create a type checker that could handle [Instagram’s massive codebase](https://instagram-engineering.com/web-service-efficiency-at-instagram-with-python-4976d078e366){:target="_blank"} of typed Python.
This mission led to the birth of the [Pyre](https://github.com/facebook/pyre-check){:target="_blank"} type checker, inspired by the robust designs of [Hack](https://hacklang.org/){:target="_blank"} and [Flow](https://flow.org/){:target="_blank"}, and written in OCaml to deliver scalable performance. 

Over the years, Pyre served us well, but as the type system evolved and the need for typechecking to drive responsive IDE emerged, it was clear that we needed to take a new approach.
We explored alternate solutions and leveraged community tools like [Pyright](https://github.com/Microsoft/pyright){:target="_blank"} for code navigation.
But the need for an extensible type checker that can bring code navigation, checking at scale, and exporting types to other services drove us to start over, creating Pyrefly. 

## The principles behind Pyrefly

Today, we’re excited to unveil Pyrefly, a project [we’ve been developing openly on](https://github.com/facebook/pyrefly){:target="_blank"} GitHub.
We invite you to explore our work and try it out on your own project.
While a project like Pyrefly is the sum of thousands of technical choices, a few notable principles we’ve followed are:

### Performance

We want to shift checks that used to happen later on CI to happening on every single keystroke.
That requires checking code at speed (on large codebases we can check 1.8 million lines of code per second!) and careful thought to incrementality and updates.
Pyrefly is implemented in Rust and designed for high performance on codebases of all sizes.

### IDE first

We want the IDE and command line to share a consistent view of the world, which means crafting abstractions that capture the differences without incurring unnecessary costs.
Designing these abstractions from the beginning is much easier than retrofitting them, which we tried with Pyre.

### Inference

Some [Python programs are typed](https://engineering.fb.com/2024/12/09/developer-tools/typed-python-2024-survey-meta/){:target="_blank"}, but many aren’t.
We want users to benefit from types even if they haven’t annotated their code – so automatically infer types for returns and local variables and display them in the IDE.
What’s more, in the IDE you can even double click to insert these inferred types if you think that would make the program better.

### Open source

Python is open source, and hugely popular.
The [Python typing specification](https://typing.python.org/en/latest/spec/){:target="_blank"} is open source, which made Pyrefly vastly easier to develop.
Many of the libraries Meta contributes to are open source,( e.g., [PyTorch](https://pytorch.org/){:target="_blank"}).

Pyrefly is also open source, [available on GitHub](https://github.com/facebook/pyrefly/){:target="_blank"} under the [MIT license](https://github.com/facebook/pyrefly/blob/main/LICENSE){:target="_blank"}, and we encourage [pull requests](https://github.com/facebook/pyrefly/pulls){:target="_blank"} and [issue reports](https://github.com/facebook/pyrefly/issues){:target="_blank"}.
We also have a [Discord channel](https://discord.com/invite/Cf7mFQtW7W){:target="_blank"} for more free flowing discussions.
We would love to build a community around Pyrefly.

## The future of Pyrefly

We will work with the Python community to drive the language forward and improve the developer experience.
Since the beginning of Pyre, we open sourced our code and contributed a number of PEPs alongside the community of type checker maintainers.
We feel we can do more with Pyrefly to help Python developers leverage the benefits of types for developers, library authors, and folks just learning the language. 

Meta has leveraged types in dynamic languages from the beginning and knows the significant benefits it brings to developer productivity and security.
We plan to share more of our learnings and tooling with [blogs](https://engineering.fb.com/2024/12/09/developer-tools/typed-python-2024-survey-meta/){:target="_blank"}, better types in the ecosystem and language enhancements. 

Today we’re releasing Pyrefly as an alpha.
At the same time, we’re busy burning down the long-tail of bugs and features aiming to remove the alpha label this Summer.
Your feedback is invaluable to get there, so please give it a try and [report your bugs](https://github.com/facebook/pyrefly/issues){:target="_blank"} or things you think can be improved.
Even if Pyrefly isn’t right for your project, we would love to hear how you use types and what you would like to see improved in your editor.

Join us on the journey as we help illuminate your bugs with Pyrefly.
Happy coding! 🐍✨

## Hear more about Pyrefly 

Check out the [episode of the Meta Tech Podcast](https://engineering.fb.com/2025/05/15/developer-tools/open-sourcing-pyrefly-a-faster-python-type-checker-written-in-rust/){:target="_blank"} where several team members share their experience developing Pyrefly and technical details for how it works.
We also just [talked at PyCon US](https://us.pycon.org/2025/schedule/presentation/118/){:target="_blank"} about high-performance Python through faster type checking and free threaded execution.

To learn more about Meta Open Source, visit our [open source site](https://opensource.fb.com/){:target="_blank"}, subscribe to our [YouTube channel](https://www.youtube.com/channel/UCCQY962PmHabTjaHv2wJzfQ){:target="_blank"}, or follow us on [Facebook](https://www.facebook.com/MetaOpenSource){:target="_blank"}, [Threads](https://www.threads.com/@metaopensource){:target="_blank"}, [X](https://x.com/MetaOpenSource){:target="_blank"}, and [LinkedIn](https://www.linkedin.com/showcase/meta-open-source?fbclid=IwZXh0bgNhZW0CMTEAAR2fEOJNb7zOi8rJeRvQry5sRxARpdL3OpS4sYLdC1_npkEy60gBS1ynXwQ_aem_mJUK6jEUApFTW75Emhtpqw){:target="_blank"}.

## Acknowledgements 

Pyrefly was created By Meta’s Python Language Tooling Team: Jia Chen, Rebecca Chen, Sam Goldman, David Luo, Kyle Into, Zeina Migeed, Neil Mitchell, Maggie Moss, Conner Nilsen, Aaron Pollack, Teddy Sudol, Steven Troxler, Lucian Wischik, Danny Yang, and Sam Zhou.

</div>
</details>

---

References

- [Introducing Pyrefly: A new type checker and IDE experience for Python - Engineering at Meta](https://engineering.fb.com/2025/05/15/developer-tools/introducing-pyrefly-a-new-type-checker-and-ide-experience-for-python/){:target="_blank"}

