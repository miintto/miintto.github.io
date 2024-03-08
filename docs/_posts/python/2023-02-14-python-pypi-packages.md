---
layout: post
title: "PyPI에 패키지를 업로드 해보자!"
date: 2023-02-14
category: python
tags:
  - python
  - pypi
  - package
thumbnail: "/img/thumbnails/python-pypi-packages.png"
---

얼마 전 스프링 프로젝트에서 Redisson 클라이언트를 사용해보면서 Python 프로젝트에도 레디스 분산 락 적용을 시도하였는데,
redis-py 라이브러리에서 지원하는 락은 기본적으로 스핀락 구조로 되어있어서 Redisson 라이브러리와 동일한 효과를 내기가 힘들어 보였습니다.
그래서 프로젝트 내에 Pub/Sub 시스템 기반으로 작동하는 락을 직접 구현하고 보니 아예 모듈로 만들어버리면 여러 프로젝트에서도 가져다 쓸 수 있을 것 같아서 아예 패키지로 만들어 보았습니다.
관련 자료를 찾아 패키지를 만들고 PyPI 사이트에 업로드하는 과정을 기록하면 두고두고 좋을 것 같아 정리해 보았습니다.

아래 제가 만들었던 패키지를 첨부했으니 참고하셔도 좋습니다.

- 패키지 : [https://pypi.org/project/redis-lock-py/](https://pypi.org/project/redis-lock-py/)
- 소스코드 : [https://github.com/miintto/redis-lock-py](https://github.com/miintto/redis-lock-py)

--- 

# 1. 소스코드 생성

가장 먼저 패키지에 들어갈 소스 코드가 있어야 합니다.
프로젝트 모듈 구성은 다음과 같이 했습니다.

```bash
$> pwd
/your/project/path/redis-lock

$> tree
.
├── PACKAGE_NAME  # 모듈명
│   ├── __init__.py
│   └──  # 모듈 파일들
├── tests
│   ├── __init__.py
│   └──  # 테스트 코드
├── .gitignore
├── pyproject.toml
└── README.md
```
## 1.1 파이썬 모듈 작성

파이썬 모듈은 반드시 `__init__.py` 파일을 포함하도록 합니다.
또한 모듈명은 패키지명과 동일하게 작성하는 것이 간단한 프로젝트 설정에 도움이 됩니다.
간혹 모듈을 프로젝트 최상위 경로가 아닌 한 단계 내려간 src/ 디렉토리 하위에 구성하는 경우도 있습니다.
둘 중 어떤 방식으로 모듈을 구성하여도 무방하며, 자세한 설명은 [src layout vs flat layout](https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/)를 참고하시면 좋습니다.

tests/ 폴더는 테스트 코드를 구성할 디렉토리로 이 부분은 별도로 설명하지 않겠습니다.

README 파일도 작성합니다.
해당 파일에 작성한 내용은 PyPI 사이트 패키지 메인 화면에 보여집니다.
패키지에 대한 간략한 설명, 설치 방법, 사용 예시 등을 적을 수 있으며, 여러 사람이 볼 수 있는 만큼 영어로 작성하면 더 좋습니다.

## 1.2 프로젝트 파일 생성

**`pyproject.toml`**은 패키지에 대한 명세를 담고 있는 파일입니다.
패키지를 빌드할 때 어떤 backend를 사용하고, 어떤 dependency를 가지고 있으며, 어떤 라이선스를 가지고 있는지 등에 대한 정보가 들어있습니다.

기존에는 `setup.py`, `setup.cfg` 파일이 해당 역할을 하였으나, 현재는 `pyproject.toml`파일로 표준화하여 새로 생성하는 패키지라면 'toml' 포맷을 사용하는 것을 권장드립니다.

간단하게 아래 내용을 채워줍니다.

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "PACKAGE_NAME"
version = "0.1.0"
authors = [
  { name="이름", email="이메일@example.com" },
]
description = "간단한 프로젝트 설명"
readme = "README.md"
requires-python = ">=3.7"
classifiers = [
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Operating System :: OS Independent",
]

[project.urls]
"Homepage" = "https://github.com/이름/레포지토리명"
```

가장 처음 `[build-system]` 에서 어떤 빌드시 어떤 백엔드를 사용할지 정의할 수 있습니다.
저는 `hatchling`을 사용하여 빌드하도록 하였습니다.
해당 라이브러리는 빌드 과정 중 임시 가상 환경에 설치되므로 굳이 로컬에 설치할 필요가 없습니다.

`[project]` 하위에는 패키지에 대한 상세 설명을 입력합니다.
대부분의 내용은 PyPI 사이트에 게시될 화면을 위한 항목입니다.
패키지명은 `name`에 명시한 값으로 생성되는데, 중복된 이름의 패키지를 생성할 수는 없으므로 사전에 동일한 패키지가 존재하는지 확인하도록 합니다.

## 1.3 License 생성

작성한 패키지의 라이선스 파일을 생성합니다.
라이선스 파일은 일반적으로 최상위 경로에 "LICENSE" 라는 파일명으로 생성하는데,
만일 패키지의 저장소를 깃허브에 구성하였다면 깃허브 사이트에서 클릭 몇 번만으로 간단하게 생성할 수 있습니다.

<img src="/img/posts/python-pypi-packages-liecense-step-1.png" style="max-width:600px"/>

먼저 깃허브 메인 프로젝트 화면에서 파일 생성 버튼을 클릭합니다.

<img src="/img/posts/python-pypi-packages-liecense-step-2.png" style="max-width:600px"/>

파일명을 입력하는곳에 "LICENSE" 혹은 "LICENCE"라고 입력하면 오른쪽에 템플릿을 생성하는란이 나타납니다.
해당 버튼을 클릭하여 라이선스 선택 창으로 넘어갑니다.

<img src="/img/posts/python-pypi-packages-liecense-step-3.png" style="max-width:720px"/>

왼쪽에 선택 가능한 라이선스가 나열되어 있습니다.
라이선스를 선택하는 것도 깊이 들어가면 정말 복잡한데 기본적으로 패키지에 종속된 오픈소스의 라이선스와 충돌되지 않도록 선택해야 합니다.
예를 들어 제가 만들 패키지가 종속된 Python 언어는 **BSD** 라이선스를, redis-py 라이브러리는 **MIT** 라이선스를 사용하고 있습니다.
해당 라이선스의 특성상 BSD, MIT 모두 선택 가능한데, 저는 MIT 라이선스를 선택하였습니다.
어떤 라이선스를 선택해야 할지 고민이 된다면 [https://choosealicense.com/](https://choosealicense.com/)에서 도움을 받을 수 있습니다.

선택이 완료되면 화면 우측에 현재 연도와 이름을 입력하고 라이선스 파일을 생성하여 깃허브 repo에 추가합니다.

---

# 2. PyPI 회원 가입

이제 모듈 구성이 어느 정도 마무리되었으니 업로드할 준비를 합니다.
[PyPI 사이트](https://pypi.org)에 접속하여 회원 가입을 진행합니다.

<img src="/img/posts/python-pypi-packages-pypi-register.png" style="max-width:320px"/>

딱히 복잡한 과정은 없습니다.
가입 시 입력한 username과 비밀번호는 패키지 업로드 시 커맨드 창에 입력해야 하므로 잘 기억해둡니다.

이왕 사이트에 들어간 김에 겹치는 패키지가 존재하는지도 한 번 확인해줍니다.

<img src="/img/posts/python-pypi-packages-pypi-search.png" style="max-width:600px"/>

혹시나 동명의 패키지가 이미 존재하는 경우에는 고유한 패키지명으로 변경 후 진행해야 합니다.

---

# 3. 빌드 및 업로드

## 3.1 패키지 빌드

패키지 빌드를 위해 `build` 라이브러리를 설치합니다.

```bash
$> pip install build
```

아래 명령어를 실행하여 패키지를 빌드합니다.

```bash
$> python -m build
* Creating venv isolated environment...
* Installing packages in isolated environment... (hatchling)
...
```

프로젝트 dist/ 디렉토리 하위에 빌드된 파일이 생성된 것을 확인할 수 있습니다.
각각 `.whl`, `tar.gz` 확장자를 가진 파일이 생성되는데 둘 다 패키지의 내용을 담고 있지만 역할이 서로 상이합니다.

`.whl` 확장자를 가진 파일은 **빌드 배포판**입니다.
빌드 배포판이란 내부에 파일과 메타 데이터를 포함하고 있으며 시스템의 올바른 위치에 구성하기만 하면 되는 배포 방식입니다.
다만 설치하기 전에 빌드하는 과정이 필요합니다.
`tar.gz` 확장자는 **소스 배포판**으로 pip를 이용하여 설치하거나 빌드 배포판을 생성하는 데 필요한 메타 데이터와 필수 원본 파일을 제공합니다.

최근의 pip는 우선적으로 빌드 배포판을 설치하도록 되어있지만, 필요에 따라 소스 베포판을 설치하도록 할 수도 있습니다.
패키지 업로드 시에는 하나의 소스 배포판과 각 플랫폼(MacOS, Linux, Windows 등)마다 알맞은 빌드 배포판을 업로드 해야 합니다.
모든 플랫폼에 범용 가능하다면 하나의 빌드 배포판만 있어도 됩니다.

## 3.2 패키지 업로드

이제 빌드된 두 파일을 업로드하면 마무리가 됩니다.
업로드를 위해서는 `twine` 라이브러리가 필요합니다.
`twine`를 설치합니다.

```bash
$> pip install twine
```

설치가 완료되었으면 아래 명령어로 dist/ 디렉토리 하위의 파일들을 업로드 합니다.
업로드 과정에서 PyPI username 과 비밀번호를 입력하는 부분이 있습니다.
회원 가입 시 기입했던 값을 넣어줍니다.

```bash
$> python -m twine upload dist/*
Uploading distributions to https://upload.pypi.org/legacy/
Enter your username: username
Enter your password: ****
Uploading PACKAGE_NAME-0.1.0-py3-none-any.whl
100% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 15.5/15.5 kB • 00:00 • 13.8 MB/s
Uploading PACKAGE_NAME-0.1.0.tar.gz
100% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 13.1/13.1 kB • 00:00 • 19.4 MB/s
```

이렇게 마무리가 되었습니다.
이제 해당 패키지는 누구나 가져다가 사용할 수 있습니다.
아래 명령어로 설치하여 정상적으로 동작하는지 확인합니다.

```bash
$> pip install PACKAGE_NAME
```

---

## 4. GitHub Action으로 자동화

여기까지만 해도 패키지를 업로드 하는 데 큰 문제가 없지만 매번 업데이트마다 수기로 빌드하고 업로드 하는 과정이 번거로울 수 있습니다.
위 과정을 GitHub Action으로 자동화한다면 패키지를 좀 더 수월하게 관리할 수 있습니다.
아래 작업은 모두 깃허브에 저장소를 구성했다는 가정하에 작성하였습니다.

Action이 실행되는 환경에서 업로드 시 일일이 username과 password를 입력할 수 없으므로 토큰을 사용한 인증 방식으로 변경해야 합니다.
토큰은 PyPI 사이트 계정 관리 화면에서 발급할 수 있습니다.

<img src="/img/posts/python-pypi-packages-pypi-token.png" style="max-width:720px"/>

'ADD API Token' 버튼을 클릭하여 토큰을 생성합니다.
토큰을 발급받았으면 해당 토큰을 Action 실행 시에 사용할 수 있도록 깃허브 secrets에 등록합니다.

YML은 아래와 같이 작성할 수 있습니다.

{% raw %}
```yml
name: Publish Workflows
on:
  push:
    branches:
     - master
jobs:
  publish:
    name: PUBLISH
    runs-on: ubuntu-latest
    steps:
    - name: CHECKOUT
      uses: actions/checkout@v4
    - name: SET UP PYTHON
      uses: actions/setup-python@v5
      with:
        python-version: "3.12"
    - name: INSTALL DEPENDENCIES
      run: |
        python -m pip install --upgrade build
    - name: BUILD PACKAGE
      run: |
        python -m build
    - name: PUBLISH
      uses: pypa/gh-action-pypi-publish@release/v1
      with:
        password: ${{ secrets.PYPI_API_TOKEN }}
```
{% endraw %}

master 브랜치에 변경(merge 혹은 push)이 일어날 때마다 Action 작업이 실행되도록 하였습니다.
`pypa/gh-action-pypi-publish` 과정에서 빌드한 파일을 PyPI에 업로드 하는데, secrets에 저장했던 토큰을 가져와서 정상적으로 인증이 이루어지도록 합니다.

위 작업 외에도 테스트 코드를 검증이나 자동 태깅 등 원하는 기능을 추가할 수 있습니다.

---

References

- [Packaging Python Projects — Python Packaging User Guide](https://packaging.python.org/en/latest/tutorials/packaging-projects/)
- [GitHub - pypa/gh-action-pypi-publish](https://github.com/pypa/gh-action-pypi-publish)
- [python 패키지 만들고 pypi에 배포하기 \| pypy.dev](https://pypy.dev/python/make-and-deploy-python-package/)
