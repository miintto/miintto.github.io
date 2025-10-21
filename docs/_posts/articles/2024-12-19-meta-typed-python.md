---
layout: post
title: "[번역] 2024년의 파이썬 타입 시스템 현황"
category: articles
tags:
  - python
  - typing
toc: true
thumbnail: "/img/thumbnails/meta-typed-python.png"
---

> 해당 포스트는 Meta Engineering 블로그의 [Typed Python in 2024: Well adopted, yet usability challenges persist](https://engineering.fb.com/2024/12/09/developer-tools/typed-python-2024-survey-meta/){:target="_blank"} 포스트를 번역한 글입니다.
> 
> 게시일: 2024.12.09

---

# 2024년 파이썬 타입: 잘 도입했음에도 여전히 남아있는 사용성 문제

올여름 JetBrains, Meta, Microsoft 3사의 주관하에 파이썬 typing 현황에 대한 대대적인 설문조사를 실시하였습니다.*
설문의 주요 목적은 오픈소스 커뮤니티의 개발자들이 타입 힌트를 사용하는 방식과 저마다의 고충 및 그들이 사용하는 도구에 대한 이해를 돕기 위함이었습니다.
타입에 대한 긍정적인 인식과는 별개로 현재 타입 시스템에 대한 어마어마한 피드백을 받았습니다.
아래에 사용성 통계와 전반적인 인식 및 시사점을 포함한 설문 결과를 정리하였으니 파이썬 개발자 도구를 개선하는데 참고가 되길 바랍니다.

## 전반적인 결과

- 전체 응답자 중 88%가 타입 힌트를 "항상" 혹은 "자주" 사용한다고 응답했습니다.
- 타입 힌트를 사용하게 된 계기로는 "IDE를 사용하면서", "문서화를 위해", "버그를 찾기 위해"가 주요 이유로 꼽혔습니다.
- 타입의 사용성 문제와 복잡한 표기 방식의 한계는 여전히 애로사항으로 남아있으며, 일부 코드에 대한 타입 체킹 누락으로 이어지고 있습니다.
- 타입 체킹 도구의 더딘 성능과 주요 라이브러리의 타입 지원 미비로 인해 타입 체커가 제대로 힘을 발휘하지 못하고 있습니다.
- 타입 검증 과정의 일관성 부족과 관련 문서의 부재로 인해 프로젝트에 타입을 도입하거나 도구 사용 시에 어려움이 따르고 있습니다.

## 설문 전략

타입에 대한 설문을 진행하면 보통 타입 애호가들이 많이 참여하는 경향이 있기 때문에 그 결과를 커뮤니티의 전체적인 경향으로 보기에는 무리가 따릅니다.
그래서 가능한 많은 개발자를 참여시키도록 노력했으며, 모든 이의 기술 수준을 아우를 수 있는 쉬운 질문만 추려내었습니다.
그렇게 우리는 개발자들의 기본 신상과 그들이 사용하는 도구 및 파이썬 타입에 대한 전반적인 인식을 파악할 수 있는 질문을 작성했습니다.
우리는 단순 지표를 넘어서 현재의 분위기를 파악하고 싶었으며, 모든 응답자들의 구체적이고 솔직한 피드백에 감사드립니다.

## 개발자 그룹

파이썬이라는 언어가 범용적으로 쓰이고 있기 때문에 파이썬 타입 역시 여러 분야에서 사용되고 있습니다.
스크립트 자동화, 웹 개발, 데이터 분석, AI/ML, devOps 그리고 교육 분야까지 모두 큰 비중을 차지했습니다.
한 가지 주목할 점은 파이썬 타입을 업무 외 환경에서 사용할 때 나타나는 양상이었습니다.
응답자 중 상당수는 개인 프로젝트에서도 별도 CI 프로세스 없이 파이썬 타입을 사용하고 있었습니다.
파이썬을 개인적으로만 사용하는 사람 중 66%의 응답자가 타입을 "항상" 또는 "자주" 사용한다고 답변하였으며, 대조적으로 업무에서만 사용하는 사람 중 78%가 타입을 사용한다고 답변하였습니다.
또한 29.6%의 응답자는 CI 단계에서 "항상" 또는 "자주" 타입 체킹을 건너뛰는 것으로 나타났습니다.

<img src="/img/posts/meta-typed-python-img001.jpg" style="max-width:600px"/>

## IDE와 타입 체커

가장 인기 있는 IDE로는 VS Code(Visual Studio Code)가 꼽혔습니다.
IDE와 타입 체커의 조합으로는 VS Code와 Mypy가 가장 많았고, 그다음으로 PyCharm과 Mypy가 차지했습니다.
Mypy는 여전히 가장 인기 있는 타입 체커 도구로 전체 응답자 중 67%가 사용하고 있었고, 38%는 Pyright를 사용한다고 응답했습니다(22%는 Mypy와 Pyright 둘 다 사용).
Emacs와 NeoVIM은 아직도 11%의 튼튼한 지지층을 보유하고 있었습니다.
IDE와 타입 체커에 대한 선호도는 상당히 다양했습니다.
정적 타입 체커는 아니지만 Pydantic을 사용한다고 응답한 개발자가 62%로 나타났고 14%는 아예 Pydantic만 사용한다고 응답했는데, 타입 시스템이 런타임 사용 사례로 확장되는 양상을 보여주었습니다.

<img src="/img/posts/meta-typed-python-img002.jpg" style="max-width:600px"/>

## 선호하는 요소

개발자들은 여러 번거로움에도 불구하고 타입 힌트가 제공하는 자동완성과 코드 명확성 개선을 긍정적으로 평가했습니다.
가장 유용한 기능으로 "향상된 IDE 지원"(59%)이 언급되었으며 "버그 방지"(49.8)와 "문서화"(49.2%)가 차례로 그 뒤를 이었습니다.
많은 사람들은 잠재적 버그를 조기에 발견하고 리팩토링이 용이해지는 점을 높이 평가하고 있었습니다.
타입 힌트 자체가 선택 사항이기 때문에 파이썬 생태계에 천천히 스며들면서 긍정적인 결과를 도출하고 있음을 보여주고 있습니다.

> "Typing 작업이 복잡해지거나 불가능하다면 설계상 결함이 존재할 수 있습니다. 그러다 **실제로 버그를 발견할 수 있습니다.**"

## 타입 시스템 문서 및 사용성 문제

우리는 개발자들로부터 자유로운 피드백을 받았고, 현재 타입 시스템의 여러 문제가 반복적으로 제기되고 있는 상황을 발견했습니다.
많이 언급되는 골칫거리로는 타입 시스템이 동적 표현 방식을 나타내기 매우 복잡하다는 문제(29명 응답)와, Mypy 같은 타입 체커의 느린 성능(22명 응답), 여러 타입 체커 간의 일관성 부족(21명 응답)을 꼽을 수 있습니다.
복잡한 타입 힌트에 대한 명확한 문서의 부재(18명 응답) 또한 많은 사람들이 문제로 제기하였습니다.

> "타입 힌트가 누락된 많은 라이브러리는 코드 분석을 저해하고 런타임 에러로 이어질 수 있습니다."

> "런타임 동적 타입을 어느 정도 정확히 표현하기 위해서는 여러 과정이 필요하며, 그럼에도 제대로 작동하지 않을 수 있습니다."

## 타입을 기피하는 이유

응답자 중 321명(29%)은 아래와 같은 이유를 들며 타입 힌트를 사용하지 않는다고 응답했습니다.
가장 많이 언급한 응답은 "프로젝트에 굳이 적용할 필요성을 못 느껴서"였으며 전체 응답자 중 11% 정도의 규모였습니다.
재미있게도 타입을 사용하지 않는다고 밝힌 321명 중에서 상당수(60%)는 여전히 타입 힌트를 "항상" 혹은 "자주" 사용한다고 응답했습니다.
전체 대상 평균치(88%)보다는 28포인트 낮은 수치이긴 하지만 상당한 비율을 차지하고 있습니다.

<img src="/img/posts/meta-typed-python-img003.jpg" style="max-width:600px"/>

## 파이썬 언어 관리자 및 도구 개발자를 위한 권고사항

개발자들은 도구 전반에 걸쳐서 더 나은 표준과 일관성을 요구하고 있습니다.
동적이고 복잡한 패턴에 대한 지원 강화와 런타입 타입 체킹 개선 또한 중요한 과제로 꼽았습니다.
모든 개발자 그룹에서 타입 체커 성능 개선에 대한 이야기가 공통으로 나왔습니다.
또한 기능적인 측면을 넘어서 파이썬 문서의 접근성과 가시성에 대해서도 여러 번 언급되었습니다.
[Python 3 typing 문서](https://docs.python.org/3/library/typing.html){:target="_blank"}는 타입을 익히고 도움을 구하는 중요한 채널로 꼽혔습니다.
하지만 동시에 많은 사람들로부터 더 개선된 문서와 특히 복잡한 타입 사용 예제를 요청하는 일관된 피드백을 받기도 했습니다.
타입을 기피하는 두 번째 이유가 "친근감 부족"(전체 대상자의 8%)인 것을 볼 때 문서의 사용성 개선이 많이 필요해 보입니다.

<img src="/img/posts/meta-typed-python-img004.jpg" style="max-width:600px"/>

## 감사드리며 한 번 더 부탁드립니다!

이번 설문에 도움을 주신 모든 분께 감사드립니다.
특히나 설문 내용을 채워주시고 솔직하고 상세한 피드백을 작성해 주신 모든 개발자분에게 큰 감사를 드립니다.
초기 기대했던 것보다 훨씬 많은 응답을 받았습니다.
커뮤니티의 많은 참여를 지켜본 것만으로도 큰 힘이 되었으며, 여러분들이 보내주신 피드백이 파이썬 타입 체킹과 도구의 미래에 대한 논의에 반영되길 기원합니다.

또한 2025년 여름에 다시 설문을 진행하여 인식의 변화와 도구의 개선 상황을 확인하는 걸 목표로 하고 있습니다.
우리에게는 내년 설문을 발전시킬 몇 가지 아이디어가 있습니다.
커뮤니티 전반에 걸쳐서 많은 의견을 듣고 타입에 대해 다양한 관심도와 경험을 가진 사람들을 대상으로 파이썬 타입에 대한 인식을 조사하려고 합니다.

내년 설문 결과는 어떻게 예상하시나요?
그리고 파이썬 타입 시스템이 사용자의 니즈에 맞추어 어떻게 개선될까요?
[토론장](https://discuss.python.org/c/typing/32){:target="_blank"}에서 많은 의견 부탁드리며 [직접 설문 데이터를 살펴보고](https://lookerstudio.google.com/reporting/15599c5b-0e51-4423-8998-cf5c1bfeea00/page/8lQ9D/edit){:target="_blank"} 당신의 인사이트를 댓글로 달아주셔도 좋습니다.

_*파이썬 개발자를 대상으로 X(구 트위터), 링크드인, Reddit 및 기타 플랫폼에 배포된 온라인 설문조사에서 1,083명의 응답을 집계하였습니다.
본 설문은 Meta, Microsoft, JetBrains에서 공동으로 주관하였으며 데이터는 2024년 7월 29일부터 2024년 10월 8일까지 수집되었습니다._

---

<details>
<summary>원문 보기</summary>
<div markdown="1">

# Typed Python in 2024: Well adopted, yet usability challenges persist

This summer, JetBrains, Meta, and Microsoft collaborated to conduct a comprehensive survey on the state of Python typing*.
The survey aimed to understand how developers in the open source community are using type hints, the challenges they face, and the tools they rely on.
Over 1,000 people took the survey and we are delighted to share the findings.
Despite the positive typing sentiment, we received fantastic (even if a little biting at times) feedback about the type system.
We’ll give a summary of the findings including usage statistics, overall sentiment and takeaways that can improve Python developer tooling. 

## Overall findings

- 88% of respondents “Always” or “Often” use Types in their Python code.
- IDE tooling, documentation, and catching bugs are drivers for the high adoption of types in survey responses,
- The usability of types and ability to express complex patterns still are challenges that leave some code unchecked.
- Latency in tooling and lack of types in popular libraries are limiting the effectiveness of type checkers.
- Inconsistency in type check implementations and poor discoverability of the documentation create friction in onboarding types into a project and seeking help when using the tools. 

## Survey methodology

A survey about types is likely to attract a lot of typing enthusiasts, so we don’t take this to be an unbiased nor representative view of everyone in the community.
We did our best to distribute to as many developers as possible and aimed for easy-to-understand questions for all skill levels.
We created questions that would give a picture of developer profiles, tools, and overall sentiment towards typed Python.
Beyond metrics, we wanted to get a sense of the current mood and are thankful for the detailed and candid feedback. 

## Developer cohorts

As a general purpose language, it was not surprising to see Python types used across many fields.
Scripting/automation, web development, data analysis, AI/ML, devOps and teaching all had large representation.
One surprising finding was the value Python types are demonstrating outside of collaborative environments.
A significant portion of respondents use Python types in personal projects (66% of respondents who only use Python personally “Always” or “Often” use types, compared to 78% of only “Professional” developers) and without CI (29.6% respondents don’t have type checking in CI use types “Always” or “Often”).

<img src="/img/posts/meta-typed-python-img001.jpg" style="max-width:600px"/>

## IDEs and type checkers

When it comes to development environments, Visual Studio (VS) Code emerged as the most popular choice.
The most popular configuration of IDE plus type checker was VS Code with Mypy followed by PyCharm with Mypy.
Mypy remains the most popular type checker, with 67% of respondents using it and 38% using Pyright (24% use both).
Emacs or NeoVIM also has a strong user base at 11% combined.
The community’s preference for both IDE and type checker tooling is still quite varied.
While not a static type checker, 62% of developers use Pydantic and 14% only use Pydantic, showing the use of the type system extending into runtime use cases.

<img src="/img/posts/meta-typed-python-img002.jpg" style="max-width:600px"/>

## What people love

Despite the challenges, developers appreciate the enhanced autocompletion and improved code clarity that type hints provide.
“Better IDE Support” was the most useful feature (59%) followed by “Preventing Bugs” (49.8%) and “Documentation” (49.2%).
They value the ability to catch potential bugs early and the ease of refactoring code.
The optional nature of typing allows for gradual adoption, which many find beneficial.

> **“It finds real bugs.** It often points to design flaws when typing is hard or impossible.”

## Common issues with type system documentation and usability

We gave developers the opportunity to provide freeform feedback and saw several issues with the current type system come up repeatedly.
The most common concerns are the complexity of the type system of expressing dynamic features (29 responses), the slow performance of type checkers like Mypy (22 responses), and the inconsistencies across different type checkers (21 responses).
Lack of clarity in documentation, especially for advanced constructs, was also a pain point (10 responses). 

> “Numerous libraries lack any type annotations, hindering code analysis and potentially leading to runtime errors.”

> “The hoops you sometimes have to jump through to at least somewhat correctly express runtime dynamic features, and even then they are often not correctly covered.”

## Why developers don’t use types

Among respondents, 321 (29%) of developers cited the following reasons for not using types in their Python code.
The primary reason for not using types is, “Not required for my projects,” which accounted for 11% of total survey responses.
Interestingly, among the 321 developers who cited this reason, the majority (60%) still reported using types “Always” or “Often.” This is 28 points below the overall survey average, yet it remains a substantial proportion.

<img src="/img/posts/meta-typed-python-img003.jpg" style="max-width:600px"/>

## Recommendations for Python language maintainers and tooling authors

Developers are asking for better standardization and consistency across tools.
Improving support for dynamic and complex patterns, as well as enhancing runtime type checking, are all key areas for further thought.
Better type checker performance was a common pain point cited by developers in all cohorts.
Beyond features and performance, the accessibility and discoverability of Python documentation was mentioned numerous times.
[The Python 3 typing docs](https://docs.python.org/3/library/typing.html){:target="_blank"} were the most popular way for people to learn about types or get help with issues.
There was consistent feedback asking for better documentation, particularly for advanced typing features that included examples.
“Lack of familiarity” was the second highest reason (8% of all responses) people are not using types.
There is an opportunity to improve discoverability and usability of documentation.

<img src="/img/posts/meta-typed-python-img004.jpg" style="max-width:600px"/>

## Thank you! Let’s do this again!

Thanks to everyone who helped create and share the survey.
An extra big thanks for everyone who filled out the survey and gave honest, detailed feedback.
We had more responses than expected!
It’s encouraging to see so much engagement from the community, and look forward to incorporating the feedback into discussions around the future of Python type checking and tools. 

We hope to run the survey again in summer 2025 to see how sentiment changes and the adoption of tooling grows.
We have a few ideas for how to improve the survey for next year.
We want to ensure that many opinions across the community are heard and that we can capture typing sentiment from folks of different ranges of experience and levels of enthusiasm for typing. 

What would you like to see in the survey next year?
How can the Python Type System evolve to meet your needs?
Join the conversation on [discourse](https://discuss.python.org/c/typing/32){:target="_blank"}. You can also [explore the data yourself through this tool](https://lookerstudio.google.com/reporting/15599c5b-0e51-4423-8998-cf5c1bfeea00/page/8lQ9D/edit){:target="_blank"} and comment below with your insights.

_*Based on an online survey conducted among 1,083 people distributed through X, LinkedIn, Reddit,and other social media platforms for targeting Python developers.
The research was conducted by Meta, Microsoft and JetBrains.
Data was collected between 07/29/2024 and 10/08/2024._

</div>
</details>

---

References

- [Introducing Immortal Objects for Python - Engineering at Meta](https://engineering.fb.com/2024/12/09/developer-tools/typed-python-2024-survey-meta/){:target="_blank"}
