---
layout: post
title: "SSL 인증서 발급 (with Let's Encrypt)"
date: 2022-12-16
category: network
tags:
  - ssl certificate
  - let's encrypt
  - certbot
banner: "/img/posts/ssl-certificate-banner.png"
---

기존 velog에서 운영하던 [개발 블로그](https://velog.io/@miintto)를 현 블로그로 새로 이전하였습니다.
도메인도 새로 생성하여 연결하긴 하였으나 HTTP로만 운영하기는 보안 이슈도 있고 좀 빈약해 보일것 같아 SSL 인증서까지 등록하기로 하였습니다.
이번에 SSL 인증서를 발급하며 겪은 등록 과정을 정리해 보았습니다.

해당 서버는 **AWS Lightsail**로 운영중이며, OS는 **Amazon Linux 2**, 웹 서버는 **Nginx**로 구성되어있습니다.

---

# 1. 시행착오

일반적으로 인증서 발급 기관은 유료인 경우가 대다수입니다.
유료와 무료 인증서 사이간의 기술적인 차이는 없으나 보안 관련한 이슈 발생시 손해 배상에 대한 책임이 다릅니다.
유료 기관을 이용하여 발급한 경우는 인증서에 문제가 생긴 경우 일정 금액 이상의 배상금을 지불해야합니다.
반면 무료 인증서는 단 한 푼도 배상받지 못합니다.
아무래도 보안 사고가 치명적인 기업이나 정부기관 같은 곳은 돈을 더 지불해서라도 유료 인증서를 발급한다고 합니다.
다만, 현 사이트는 개인적으로 사용할 블로그라 무료 인증서를 발급하려고 합니다.

찾아보니 AWS에서 무료로 SSL 인증서를 발급해주는 프로세스가 있었습니다.
AWS 콘솔의 Certificate Manager 페이지에서 SSL 인증서를 발급할 수 있습니다.

다만, 발급을 끝내고나서야 알게 된 게 여기서 발급한 인증서는 로드밸런서를 구성해야만 적용할 수 있습니다.
현 블로그는 트래픽이 많지 않아서 가벼운 인스턴스 하나로만 운영할 계획이라 로드밸런서까지 구성하기엔 좀 부담스러워서 다른 방법을 찾아보았습니다.

---

# 2. Let's Encrypt를 이용하여 발급

**Let's Encrypt** 서비스를 사용하면 SSL 인증서를 무료로 발급할 수 있습니다.
서버상에서는 certbot를 설치하여 명령어 몇 줄로 쉽게 발급이 가능합니다.

## 2.1 Certbot 설치

다음 명령어로 certbot를 설치합니다.

```bash
# 저장소 추가
$> amazon-linux-extras install -y epel
# certbot 설치
$> yum install -y certbot
```

## 2.2 인증서 발급

인증서를 발급하는 동안 잠시 웹 서버를 중지합니다.

```bash
$> systemctl stop nginx
```

명령어 `certbot certonly --standalone -d` 뒤에 **대상 도메인**을 입력하여 해당 도메인에 대한 인증서를 발급합니다.
이메일 및 약관에 대한 동의 여부를 입력하는 부분도 알맞게 기입합니다.

```bash
$> certbot certonly --standalone -d blog.miintto.com

Saving debug log to /var/log/letsencrypt/letsencrypt.log
Plugins selected: Authenticator standalone, Installer None
Enter email address (used for urgent renewal and security notices)
 (Enter 'c' to cancel): ****@gmail.com

...

IMPORTANT NOTES:
 - Congratulations! Your certificate and chain have been saved at:
   /etc/letsencrypt/live/blog.miintto.com/fullchain.pem
   Your key file has been saved at:
   /etc/letsencrypt/live/blog.miintto.com/privkey.pem
   Your certificate will expire on 2023-xx-xx. To obtain a new or
...
```

발급이 완료되면 인증서가 저장된 위치 및 만료 일시를 알려줍니다.

## 2.3 인증서 적용

서버의 443 포트를 개방합니다.
저는 Lightsail로 운영중이라 AWS 콘솔 화면에서 설정하였습니다.

```bash
# 443 포트 개방
$> firewall-cmd --permanent --add-service=https
$> firewall-cmd --reload
# 개방된 포트 확인
$> netstat -tnlp
Proto Recv-Q Send-Q Local Address  Foreign Address  State   PID/Program name
tcp        0      0 0.0.0.0:443    0.0.0.0:*        LISTEN  -
tcp        0      0 0.0.0.0:80     0.0.0.0:*        LISTEN  -
...
```

Nginx 설정 파일을 수정하여 발급한 인증서를 적용합니다.
기존 80 포트 대신 443 포트를 사용하도록 변경합니다.
또한 80 포트로 유입되는 경우는 다시 HTTPS로 리다이렉트되도록 합니다.

```bash
server {
  listen 80;
  server_name blog.miintto.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name blog.miintto.com;

  # 인증서의 경로 입력
  ssl_certificate /etc/letsencrypt/live/blog.miintto.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/blog.miintto.com/privkey.pem;

  ...
}
```

중지했던 Nginx를 다시 시작해줍니다.

```bash
$> sudo systemctl restart nginx
```

설정이 끝나면 `https://` 경로를 이용하여 접속되는것을 확인합니다.
사파리, 크롬 등 브라우저에서 등록된 인증서를 확인할 수 있습니다.

<img src="/img/posts/ssl-certificate-display.jpg" style="max-width:480px"/>

## 2.4 인증서 자동 갱신 cron 등록

해당 인증서의 유효기간은 90일이어서 주기적으로 갱신을 해주어야 합니다.
일일히 작업하기 번거로우니 crontab에 등록하여 자동으로 갱신 작업을 하도록 합니다.

먼저, 갱신 작업 앞뒤로 웹서버를 중지하고 다시 재기동시키는 로직을 추가합니다.
관련 설정 파일에서 `pre_hook`, `post_hook` 값을 정의하여 인증서 재발급 작업 전후로 수행할 작업을 설정할 수 있습니다.

```bash
$> vim /etc/letsencrypt/renewal/blog.miintto.com.conf

[renewalparams]
...
pre_hook = systemctl stop nginx
post_hook = systemctl restart nginx
```

crontab을 등록하여 매 달 1일 자정에 인증서를 자동으로 갱신하도록 설정합니다.

```bash
$> crontab -e
0 0 1 * * /bin/bash -l -c 'sudo certbot renew --quiet'
```

---

References

- [HTTPS와 SSL 인증서 - 생활코딩](https://opentutorials.org/course/228/4894)
- [SSL 인증서는 도대체 뭔가요? · Tonic](https://devlog.jwgo.kr/2019/04/12/what-is-ssl/)
- [Lightsail에 표준 Let’s Encrypt 인증서 설치](https://aws.amazon.com/ko/premiumsupport/knowledge-center/lightsail-standard-ssl-certificate/)
- [CentOS7 + nginx 에 Lets Encrypt 무료인증서 설치 & 설정](https://stove99.github.io/linux/2019/08/27/install-lets-encrypt-to-nginx-in-centos/)
