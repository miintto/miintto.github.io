---
layout: post
title: "CPython 컴파일하기"
category: python
tags:
  - python
  - compile
toc: true
thumbnail: "/img/thumbnails/python.png"
---

여기서는 파이썬 인터프리터를 운영 체제에 직접 설치하는 과정을 정리해 보았습니다.
설치한 CPython 버전은 3.13 이며, 운영체제는 Amazon Linux 2023 기준으로 진행하였습니다.

---

# 1. Requirements

CPython은 기본적으로 C 언어로 작성되어 있습니다.
따라서 CPython 소스 코드를 실행 가능한 바이너리로 만들기 위해서는 **GCC**(GNU Compiler Collection)가 필요합니다.
또한 표준 라이브러리에서 제공하는 보안 및 암호화 기능 구현을 위해 **OpenSSL**도 필요합니다.

운영체제에 설치된 각 라이브러리의 버전을 확인할 수 있습니다.

```shell
$> gcc --version
gcc (GCC) 11.4.1 20230605 (Red Hat 11.4.1-2)
Copyright (C) 2021 Free Software Foundation, Inc.
This is free software; see the source for copying conditions.  There is NO
warranty; not even for MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

$> openssl version
OpenSSL 3.0.8 7 Feb 2023 (Library: OpenSSL 3.0.8 7 Feb 2023)
```

만일 설치되어 있지 않다면 설치합니다.

```shell
$> sudo yum install -y gcc openssl
```

그 외 필요한 라이브러리를 설치합니다. 

```shell
$> sudo yum install -y \
        openssl-devel \
        zlib-devel \
        libffi-devel \
        sqlite-devel \
        bzip2-devel \
        readline-devel \
        xz-devel \
        gdbm-devel \
        ncurses-devel
```

모든 라이브러리가 반드시 필요한 건 아니니 일부 라이브러리는 필요에 따라 제외하여도 됩니다.

- **openssl-devel**: 헤더 파일(ssl.h)을 포함한 OpenSSL 개발 패키지를 설치됩니다. HTTPS 및 암호화 관련 기능을 위한 필수 라이브러리로 누락된 경우 `ssl`, `hashlib` 모듈이 빌드되지 않으므로 반드시 설치해야 합니다.
- **zlib-devel**: 데이터 압축 라이브러리 `zlib` 사용에 필요합니다. 많은 패키지가 압축 기능을 사용하기 때문에 설치하는걸 권장합니다.
- **libffi-devel**: 외부 C 라이브러리를 호출하는 `ctypes` 라이브러리에 필요합니다.
- sqlite-devel: 파이썬 내장 데이터베이스 `sqlite` 사용을 위한 라이브러리입니다.
- bzip2-devel: `bz2` 압축 지원을 위해 필요합니다.
- readline-devel: Python REPL에서 편집 기능을 위한 `readline` 라이브러리에 필요합니다.
- xz-devel: `lzma` 압축 지원을 위한 라이브러리입니다.
- gdbm-devel: `dbm` 모듈을 빌드할 때 필요합니다.
- ncurses-devel: 터미널 내 커맨드라인 제어와 텍스트 인터페이스를 위한 라이브러리입니다.

---

# 2. Clone

빌드를 위한 CPython 소스코드를 가져옵니다.

```shell
$> wget https://www.python.org/ftp/python/3.13.0/Python-3.13.0.tgz
$> tar xzf Python-3.13.0.tgz
$> cd Python-3.13.0
```

혹은 git으로 레포지토리를 clone해도 무방합니다.

```shell
$> git clone --branch 3.13 https://github.com/python/cpython
$> cd cpython
```

---

# 3. Configure

준비가 완료되었으면 `configure` 스크립트를 실행합니다.

```shell
$> sudo ./configure --enable-optimizations
```

위 명령의 결과로 `Makefile`이 생성됩니다.
해당 파일에는 컴파일 과정에 사용할 규칙 및 옵션들이 정의되어 있습니다.

`--enable-optimizations` 옵션은 빌드할 때 성능 최적화를 활성화하는 역할을 합니다.
해당 옵션으로 

```bash
checking for stdlib extension module _multiprocessing... yes
checking for stdlib extension module _posixshmem... yes
checking for stdlib extension module fcntl... yes
checking for stdlib extension module mmap... yes
checking for stdlib extension module _socket... yes
...
```

socket, ssl, zlib, hashlib 등의 표준 라이브러리 설치에 문제가 없는지 확인합니다.
만일 missing으로 표기된다면 빌드된 파이썬에서 해당 라이브러리 import가 작동하지 않을 수 있습니다.

> 동일한 디렉토리에서 configure 과정을 다시 실행한다면 `make clean` 명령을 실행해야합니다.

---

# 4. Make

이제 CPython 을 컴파일 할 수 있습니다.
`make` 명령어를 실행하여 Makefile에 정의된 규칙을 기준으로 소스 코드를 컴파일하여 파이썬 실행 파일을 생성할 수 있습니다.

```shell
$> sudo make -j$(nproc)
$> sudo make altinstall
```

`-j` 옵션으로 빌드시 사용할 코어 개수를 정의할 수 있습니다.
여러 코어를 사용하여 병렬 컴파일을 수행하는 경우 빌드 시간을 단축할 수 있습니다.
`$(nproc)`값으로 호스트의 CPU 코어수를 자동으로 가져오도록 하였습니다.

`altinstall`과 `install` 둘 다 빌드된 파이썬 바이트코드를 지정된 경로일반적으로 /usr/local)에 복사하는 명령어입니다.
차이점이 있다면 심볼릭 링크 생성 유무인데, `install`는 설치하는 python 및 pip에 심볼릭 링크를 설정하며 `altinstall` 에서는 심볼릭 링크를 생성하지 않습니다.
일반적으로 기존 호스트에 설치된 파이썬에 영향을 주지 않는 `altinstall` 사용을 권장하고 있습니다.

Make 과정에서 약간의 시간이 소요될 수 있습니다.
필자는 약 20분 정도 걸렸습니다.

## 4.1 Main build steps

파이썬이 빌드되는 과정은 아래와 같습니다.

1. C 확장자(.c) 파일을 오브젝트 파일(.o)로 컴파일.
2. 컴파일된 오브젝트 파일을 하나로 묶어서 정적 라이브러리 파일 libpython3.x.a 생성.
3. Python의 메인 실행 파일 python.o과 정적 라이브러리 libpython를 결합하여 최종 실행 파일(python) 생성.

모든 과정이 완료되면 프로젝트 루트에 python 파일이 생성됩니다.

```shell
$> ./python --version
Python 3.13.0
```

또한 동시에 /usr/local/bin/ 경로에도 python 바이너리가 생성됩니다.
해당 파일이 시스템 전역에서 파이썬 인터프리터로 사용될 예정이므로 잘 동작하는지 확인합니다.

```shell
$> /usr/local/bin/python3.13 --version
Python 3.13.0
```

---

References
- Antony Shaw, CPython 파헤치기: 따라 하면서 이해하는 파이썬 내부 동작 원리, 김성현, 인사이트, 2022-09-23
- [3. Configure Python — Python 3.13.0 documentation](https://docs.python.org/3/using/configure.html)
- [Setup and building - Python Developer's Guide](https://devguide.python.org/getting-started/setup-building/)
- [Installing a Newer Version of Python on Amazon EC2](https://hkamran.com/article/installing-newer-python-amazon-ec2)