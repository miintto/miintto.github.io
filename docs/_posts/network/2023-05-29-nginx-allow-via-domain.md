---
layout: post
title: "[Nginx] 도메인 유입만 허용하는 방법"
date: 2023-05-29
category: network
tags:
  - network
  - nginx
banner: "/img/posts/nginx-allow-via-domain-banner.png"
---

현 블로그를 운영한 지 일 년 정도 된 시점에서 마음 한편에선 구글 검색 노출에 대한 욕심이 슬며시 생겨났습니다.
벨로그에서 블로그를 운영할 때는 그런 부분에 대해서 어느 정도 최적화가 되어있는지 간헐적으로 구글 검색에 내 포스트가 노출되기도 했습니다.
내가 작성한 글이 구글 검색에 잡혀있는 모습이 뭔가 신기하기도 하고 뿌듯하기도 했었는데,
이곳에선 그런 부분을 전혀 신경 쓰지 않았더니 얄짤없었습니다.

부랴부랴 블로그 html마다 open graph 태그도 박아넣었고, 구글 search console에 사이트를 등록하여 페이지 인덱싱도 진행하였습니다.
가이드에 따르면 보통 인덱싱이 되어 구글 검색에 노출되기까지는 일주일 정도의 시간이 소요된다고 합니다.
아마 구글이 크롤링하는 사이트의 규모가 상당하기에 검색 대상에 반영되기까지 여러 과정이 있는 것 같습니다.
아무튼 작업을 끝낸 후 어느 정도 텀이 있어서 그런지 기껏 사이트를 등록해두고는 한동안 까맣게 잊고 있었습니다.

---

# 1. Issue

어느 날 문득 다시 search console에 등록해 두었던 블로그가 생각나 구글 검색창에 제 블로그를 한 번 검색해 보았습니다.
한 달 가까이 시간이 흐른 뒤라 충분히 인덱싱이되고도 남을 시간이었습니다.
하지만 블로그 명을 입력한 후 두 눈으로 목격한 결과는 뭔가 2% 부족한 모습이었습니다.

<img src="/img/posts/nginx-allow-via-domain-search-result.png" style="max-width:720px"/>

문제는 바로 검색 결과가 도메인이 아닌 IP로 연결되어 있다는 것이었습니다.
기껏 AWS에서 도메인도 구입하고 SSL 인증서도 적용했건만 구글 검색 결과는 언제 변할지 모르는 IP 주소를 고대로 노출하고 있었습니다.
더욱이 슬픈 건 SSL 인증서가 도메인에만 적용되어 있어서 해당 링크를 클릭하면 브라우저 단에서 페이지가 차단된다는 점입니다.

<img src="/img/posts/nginx-allow-via-domain-denied-page.png" style="max-width:720px"/>

ㅠㅠㅠㅠㅠㅠㅠ

---

# 2. Allow via Domain Only

해당 이슈의 원인을 확인해 보니 블로그 서버에 IP 접근이 허용되고 있던 부분이 문제였습니다.
AWS와 같은 클라우드 환경에서 인스턴스를 생성하는 경우에는 별다른 설정을 하지 않으면 기본적으로 IP주소 접근이 허용되는데 구글 크롤러가 이를 반영하여 IP로 매핑한다고 합니다.
따라서 도메인 접근만 허용하고 IP로 접근하는 경우 에러를 발생시킨다면 크롤러는 해당 요청이 잘못되었다는 것을 깨닫고 검색 결과에 도메인으로 반영하게 됩니다.

해당 부분은 nginx에서 설정할 수 있습니다.
먼저 현 블로그에 적용되어있는 nginx 설정을 확인해봅시다.

```shell
server {
  listen 80;
  server_name blog.miintto.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name blog.miintto.com;

  ssl_certificate /etc/letsencrypt/live/blog.miintto.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/blog.miintto.com/privkey.pem;

  ...
}
```

위와 같이 blog.miintto.com 도메인에 접근하는 경우 기본적으로 HTTPS 프로토콜을 허용하였고, 80포트(HTTP)로 접근하는 경우에는 HTTPS로 리다이렉트 되도록 하였습니다.

여기서 nginx 환경설정에 아래 내용을 추가해 줍니다.

```shell
server {
  listen 80 default_server;
  listen 443 default_server;
  ssl_certificate /etc/letsencrypt/live/blog.miintto.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/blog.miintto.com/privkey.pem;
  return 404;  # 기본적으로 유입되는 경우에는 404로 응답.
}

server {  # 이하 내용은 동일
  listen 80;
  server_name blog.miintto.com;
...
```

`listen` 뒤에 `default_server` 값을 기입한 경우에는 해당 포트로 접근하는 전반적인 요청에 대해서 처리하게 됩니다.
즉, 요청이 들어온 IP 혹은 도메인과 일치하는 `server_name`이 존재하지 않으면 기본적으로 `default_server`에 정의대로 처리됩니다.
따라서 blog.miintto.com 도메인이 아니라 IP주소로 들어온 경우에는 설정해 준 대로 404 에러를 반환하게 됩니다.
404 에러 대신 400, 403, 444 에러를 발생시켜도 무방합니다.

설정울 마친 후 며칠 뒤 다시 검색 결과를 확인해 보면 아래와 같이 도메인으로 연결된 것을 확인할 수 있습니다.

<img src="/img/posts/nginx-allow-via-domain-improved-search-result.png" style="max-width:720px"/>

---

Reference

- [구글 검색에 도메인이 IP로 나올 때 - When a domain is listed as an IP in Google search](https://www.youtube.com/watch?v=jrpw7YUEHiU)
- [라즈베리파이4 설정(4) - NGINX에서 도메인으로 접속만 허용하기(IP주소 직접접속 차단)](https://www.codesarang.com/8)
- [Nginx allow via Domain but not via the IP](https://stackoverflow.com/questions/61800208/nginx-allow-via-domain-but-not-via-the-ip)
