---
layout: post
title: "[OpenSearch] 은전한닢 설치하기"
category: elasticsearch
tags:
  - opensearch
  - plugin
  - sbt
  - seunjeon
thumbnail: "/img/thumbnails/opensearch-seunjeon.png"
---

저희 회사에서는 검색 엔진으로 엘라스틱서치를 사용하고 있습니다.
초창기에는 Elastic 클라우드 서비스를 활용하여 운영하였으나 인프라 아키텍처를 재편성하면서 **AWS OpenSearch**로 이관하였습니다.
개발기는 별도 AWS OpenSearch 도메인을 구성하는 대신 개발 인스턴스의 남는 자원을 활용하여 오픈서치를 직접 구동시키는 방법으로 운영하였습니다.

운영기에 맞추어 개발기의 버전도 1.2.4로 통일하였지만, 문제가 되었던 부분은 형태소 분석기였습니다.
AWS OpenSearch에서는 공식적으로 한글 분석을 위해 **은전한닢(Seunjeon)** 분석기를 지원하고 있습니다.
2023년부터 nori 분석기도 지원하고 있지만 [공식 문서](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-plugins.html)에 따르면 1.3 버전부터 사용할 수 있게 되어있습니다.
반면 개발기의 경우 플러그인을 직접 설치해 주어야 하는데 [공식 은전한닢 프로젝트](https://bitbucket.org/eunjeon/seunjeon)는 엘라스틱서치 6 버전까지만 지원하고 있어서 엘라스틱서치 7 버전이나 오픈서치에서는 직접 설치가 불가능한 상황이었습니다.

어쨋든 개발을 위해 개발 & 운영 간 통일된 형태소 분석기를 구성하는 건 반드시 필요한 일이었습니다.
AWS에서 버젓이 은전한닢을 공식적으로 지원하는 걸 보면 오픈서치에 어떻게든 설치할 방법이 있지 않을까 하는 막연한 생각에 개발 오픈서치에 은전한닢 분석기를 설치하기로 했습니다.

---

# 1. Plugin

엘라스틱서치에도 기본적으로 많은 기능이 있지만 다양한 기능과 확장성을 위해 부가적으로 다양한 플러그인을 지원하고 있습니다.
위에서 설명한 형태소 분석기 외에도 보안, 모니터링, 알림 등의 기능을 하는 여러 플러그인이 존재합니다.

동일한 기능을 하는 플러그인이더라도 엘라스틱서치의 버전에 따라 여러 버전이 존재할 수 있습니다.
엘라스틱서치의 버전이 올라가면서 플러그인과 호환성이 어그러질 수 있기 때문에 웬만하면 동일한 버전을 설치하는 걸 권장하고 있습니다.
예를 들어 엘라스틱서치 6.x 버전과 7.x 버전은 플러그인 디렉토리 구조가 달라서 서로 호환이 되지 않습니다.

아래와 같이 현재 설치된 플러그인과 버전을 조회할 수 있습니다.

```shell
GET /_cat/plugins?v

name          component      version
60958e271a6b  analysis-icu   7.16.1
60958e271a6b  analysis-nori  7.16.1
...
```

## 1.1 Structure

대다수의 플러그인은 ZIP 파일 형태로 배포되는데 기본적으로 아래와 같은 구조로 되어있습니다.

```shell
custom-plugin-7.x.x.zip
├── custom-plugin-7.x.x.jar
└── plugin-descriptor.properties
```

JAR 파일은 플러그인의 주 실행 파일입니다.
플러그인의 주요 기능을 구성하는 Java 클래스 파일들이 포함되어 있습니다.

plugin-descriptor.properties 파일에는 메타데이터가 정의되어 있습니다.
아래와 같이 플러그인의 이름과 버전, 메인 클래스, 엘라스틱서치 호환 버전 등을 포함하고 있습니다.

```conf
description=The Korean(seunjeon) analysis plugin.
version=6.1.1.0
name=analysis-seunjeon
classname=org.bitbucket.eunjeon.seunjeon.elasticsearch.plugin.analysis.AnalysisSeunjeonPlugin
java.version=1.8
elasticsearch.version=6.1.1
```

엘라스틱서치 6 이하 버전의 플러그인은 다른 구조로 되어있습니다.
구성 파일이 루트 디렉토리가 아닌 elasticsearch/ 디렉토리 하위에 위치해야 합니다.

```shell
custom-plugin-6.x.x.zip
└── elasticsearch/
    ├── custom-plugin-6.x.x.jar
    └── plugin-descriptor.properties
```

## 1.2 Installation

플러그인은 `elasticsearch-plugin` 명령어를 사용하여 설치할 수 있습니다.

```shell
# 플러그인 다운로드
$> wget https://example.com/plugins/custom-plugin-7.16.1.zip
# 플러그인 설치
$> bin/elasticsearch-plugin install file:///path/custom-plugin-7.16.1.zip

-> Installing file:///path/custom-plugin-7.16.1.zip
-> Downloading file:///path/custom-plugin-7.16.1.zip
-> Installed custom-plugin with folder name custom-plugin
```

플러그인 설치 과정에서 엘라스틱서치는 메타데이터(plugin-descriptor.properties) 파일을 읽고 `elasticsearch.version` 값이 버전과 일치하는지 검증합니다.
만일 버전이 일치하지 않으면 설치 과정에서 아래 에러가 발생합니다.

```shell
Exception in thread "main" java.lang.IllegalArgumentException: Plugin [custom-plugin] was built for Elasticsearch version 6.1.1 but version 7.16.1 is running
    at org.elasticsearch.plugins.PluginsService.verifyCompatibility(PluginsService.java:391)
    at org.elasticsearch.plugins.cli.InstallPluginAction.loadPluginInfo(InstallPluginAction.java:831)
    at org.elasticsearch.plugins.cli.InstallPluginAction.installPlugin(InstallPluginAction.java:887)
```

만일 공식 플러그인이라면 레지스트리를 통해 직접 설치할 수 있습니다.
이 경우 엘라스틱서치 버전에 알맞은 플러그인을 자동으로 가져와 설치합니다.

```shell
$> bin/elasticsearch-plugin install analysis-icu
```

설치 후에는 엘라스틱서치를 재시작해 주어야 설치한 플러그인이 반영됩니다.

```shell
$> systemctl restart elasticsearch
```

---

# 2. Apply to OpenSearch

위 내용을 기반으로 오픈서치에 은전한닢 플러그인 설치를 진행했습니다.
기본적인 원리는 엘라스틱서치와 오픈서치가 동일합니다.
다만 설치 명령어로 `opensearch-plugin`을 사용하고, 버전 검증 과정에서 메타데이터의 `elasticsearch.version` 대신 `opensearch.version`을 확인하는 차이 정도입니다.

은전한닢 형태소 분석기는 공식적으로 6.1.1.1 버전까지 지원하고 있지만 다행히도 [7 버전 이상에서도 호환 가능한 플러그인을 제공하는 프로젝트](https://github.com/likejazz/seunjeon-elasticsearch-7)를 발견하였습니다.
모든 버전이 아닌 7.9.1, 7.16.2 등과 같은 특정 버전만 지원하고 있지만, 프로젝트 내부에 plugin-descriptor.properties 파일의 엘라스틱서치 호환 버전을 임의로 변경해 주는 [스크립트](https://github.com/likejazz/seunjeon-elasticsearch-7/blob/master/elasticsearch/scripts/downloader.sh)를 제공하고 있습니다.

해당 스크립트를 조금 변경하여 오픈서치의 버전에 알맞게 바꾸어주었습니다.

```bash
#!/usr/bin/env bash

OPENSEARCH_VERSION="1.2.4"
PLUGIN_VERSION="7.9.1"

ZIP_NAME="analysis-seunjeon-${PLUGIN_VERSION}.zip"
TMP_DIR="/tmp/analysis-seunjeon"
mkdir -p $TMP_DIR

########################################################################################################################
# download zip
REMOTE_FILE_NAME="https://github.com/likejazz/seunjeon-elasticsearch-7/releases/download/${PLUGIN_VERSION}/${ZIP_NAME}"
curl -L -o ${TMP_DIR}/${ZIP_NAME} $REMOTE_FILE_NAME
if [ "$?" -ne "0" ]; then
    echo "invalid path $REMOTE_FILE_NAME"
    exit 1
fi

pushd $TMP_DIR

########################################################################################################################
# build properties file
PROPERTI_FILE="plugin-descriptor.properties"

cat > $PROPERTI_FILE << EOF
description=The Korean(seunjeon) analysis plugin.
version=${PLUGIN_VERSION}
name=analysis-seunjeon
classname=org.bitbucket.eunjeon.seunjeon.elasticsearch.plugin.analysis.AnalysisSeunjeonPlugin
java.version=1.8
opensearch.version=${OPENSEARCH_VERSION}
EOF

########################################################################################################################
# zipping...
zip $ZIP_NAME $PROPERTI_FILE
if [ "$?" -ne "0" ]; then
    exit 1
fi

popd

########################################################################################################################
# copy a plugin file to current directory.
cp $TMP_DIR/$ZIP_NAME .
```

개발 오픈서치는 도커 기반으로 구성하였는데 아래와 같이 변화를 주었습니다.
빌드 이미지를 별도 분리하여 다운받은 플러그인을 오픈서치 1.2.4 버전으로 태깅하고, 런타임에서는 플러그인 ZIP 파일을 가져와 설치하는 방식으로 구성하였습니다.

```dockerfile
FROM ubuntu:latest AS build
WORKDIR /app/build
RUN apt-get update && apt-get -y upgrade \
    && apt-get install -y curl zip
COPY ./scripts/downloads.sh .
RUN bash downloads.sh

FROM opensearchproject/opensearch:1.2.4 AS runtime
WORKDIR /usr/share/opensearch
COPY --from=build /app/build/analysis-seunjeon-7.9.1.zip .
RUN /usr/share/opensearch/bin/opensearch-plugin install --batch file://`pwd`/analysis-seunjeon-7.9.1.zip
```

이후 도커 이미지를 빌드해보았지만 아래 에러가 발생하며 실패하고 말았습니다.

```txt
org.opensearch.bootstrap.StartupException: OpenSearchException[Unable to load plugin class [org.bitbucket.eunjeon.seunjeon.elasticsearch.plugin.analysis.AnalysisSeunjeonPlugin]]; nested: NoClassDefFoundError[org/elasticsearch/plugins/AnalysisPlugin];
    at org.opensearch.bootstrap.OpenSearch.init(OpenSearch.java:182) ~[opensearch-1.2.4.jar:1.2.4]
    at org.opensearch.bootstrap.OpenSearch.execute(OpenSearch.java:169) ~[opensearch-1.2.4.jar:1.2.4]
    at org.opensearch.cli.EnvironmentAwareCommand.execute(EnvironmentAwareCommand.java:100) ~[opensearch-1.2.4.jar:1.2.4]
```

아무래도 엘라스틱서치 플러그인을 오픈서치에 그대로 가져다가 설치해서 발생한 오류로 보여집니다.

---

# 3. Build with sbt

다른 방안을 물색하던 끝에 은전한닢을 오픈서치에 적용 가능하도록 패치한 프로젝트 [seunjeon-opensearch](https://bitbucket.org/soosinha/seunjeon-opensearch) 를 발견했습니다.
공식 은전한닢 repo를 포크하여 오픈서치 버전으로 리팩토링한 프로젝트였습니다.
다만 별도 ZIP 파일을 내려받을 레지스트리가 없는 것 같아서 플러그인을 직접 빌드해야만 했습니다.

기본적으로 은전한닢은 **sbt**를 이용하여 빌드하도록 되어있습니다.
sbt란 Simple Build Tool의 약자로 Java와 Scalar로 작성된 프로젝트를 빌드하기 위한 도구입니다.
build.sbt 파일에서 프로젝트의 빌드 과정을 정의하며 `libraryDependencies` 에서 의존성을 관리합니다.

빌드를 위해 JDK 1.8과 스칼라 2.12 환경이 필요했는데 로컬 환경에 구성하기는 번거로울 것 같아 도커 이미지를 빌드하였습니다.
빌드 이미지에서 sbt 환경 구성 및 플러그인 빌드를 진행하고 opensearch/target/ 경로에 생성된 ZIP 파일만 런타임 이미지로 가져와 플러그인을 설치하도록 구성하였습니다.

```dockerfile
FROM openjdk:8 AS build
RUN apt-get update && apt-get install -y curl git wget \
    && echo "deb https://repo.scala-sbt.org/scalasbt/debian /" | tee -a /etc/apt/sources.list.d/sbt.list \
    && curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | apt-key add \
    && apt-get update && apt-get install -y sbt
WORKDIR /app
RUN git clone https://bitbucket.org/soosinha/seunjeon-opensearch.git
WORKDIR /app/seunjeon-opensearch
RUN echo "addSbtPlugin(\"com.jsuereth\" % \"sbt-pgp\" % \"1.1.0\")" >> ./project/plugins.sbt \
    && sbt update
RUN sed -i 's/val opensearchVersion = "1.0.0"/val opensearchVersion = "1.2.4"/' build.sbt \
    && sed -i 's/val opensearchJarVersion = "1.0.0-beta1"/val opensearchJarVersion = "1.0.0"/' build.sbt \
    && bash ./scripts/download-dict.sh mecab-ko-dic-2.0.1-20150920 \
    && sbt -J-Xmx2G "runMain org.bitbucket.eunjeon.seunjeon.DictBuilder" \
    && sbt "project opensearch" "opensearchZip"

FROM opensearchproject/opensearch:1.2.4 AS runtime
WORKDIR /usr/share/opensearch
COPY --from=build /app/seunjeon-opensearch/opensearch/target/opensearch-analysis-seunjeon-assembly-1.2.4.zip .
RUN /usr/share/opensearch/bin/opensearch-plugin install --batch file://`pwd`/opensearch-analysis-seunjeon-assembly-1.2.4.zip
```

도커 이미지에서도 sbt 빌드 환경을 구성하는 건 꽤나 까다로운 일이었습니다.
프로젝트 README 에서 어느 정도 빌드 가이드를 제공하고 있었지만, sbt-pgp 플러그인이 누락되어 추가로 구성하거나 버전 태깅 같은 부분에 대해 약간의 수정이 필요했습니다.

빌드 후 오픈서치를 실행해 보면 은전한닢 형태소 분석기가 설치된 것을 확인할 수 있습니다.

```bash
GET /_cat/plugins?v

name             component                     version
opensearch-node  analysis-seunjeon             1.2.4
opensearch-node  opensearch-alerting           1.2.4.0
opensearch-node  opensearch-anomaly-detection  1.2.4.0
...
```

---

References

- [Plugin management \| Elastic](https://www.elastic.co/guide/en/elasticsearch/plugins/current/plugin-management.html)
- [eunjeon / seunjeon — Bitbucket](https://bitbucket.org/eunjeon/seunjeon)
- [GitHub - likejazz/seunjeon-elasticsearch-7](https://github.com/likejazz/seunjeon-elasticsearch-7)
- [엘라스틱서치 7을 위한 은전한닢 형태소 분석기 · The Missing Papers](https://docs.likejazz.com/seunjeon-elasticsearch-7/)
- [soosinha / seunjeon-opensearch — Bitbucket](https://bitbucket.org/soosinha/seunjeon-opensearch)
- [seunjeon package build 진행 시 오류](https://groups.google.com/g/eunjeon/c/5P4ekbXb5O8)
