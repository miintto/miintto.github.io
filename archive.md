---
layout: page
title: Archives
---

{% assign year = 0 %}

<div class="container">
  <div class="row">
    <h3>{{ site.posts.size }} Posts Below!</h3>
      <!-- Post List -->
      {% for post in site.posts %}

      {% assign current_year = post.date | date: '%Y' %}
      {% if current_year != year %}
        <hr>
        <h1>🗓️ {{ current_year }}</h1>
        {% assign year = current_year %}
      {% endif %}

      <div class="archive-post">
        <div class="archive-date font-light-3">
          <p>{{ post.date | date: '%m.%d' }}</p>
        </div>
        <div class="archive-title font-light-2">
          <a href="{{ post.url | prepend: site.baseurl | replace: '//', '/' }}">
            <p>{{ post.title }}</p>
          </a>
        </div>
      </div>

      {% endfor %}

    <hr>
    <p></p>

  </div>
</div>
