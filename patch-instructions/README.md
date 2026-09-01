# 좌표 추가 안내

`data/projects/minimal-courtyard-pocheon.json`은 이미 완성된 파일로 첨부했으니
그냥 통째로 덮어쓰면 됩니다.

나머지 2개는 파일 전체를 다시 옮겨적다가 긴 본문(article) 내용을 실수로 망가뜨릴
위험이 있어서, 대신 "이 줄 찾아서 두 줄만 추가"하는 방식으로 안내합니다.

## data/projects/naturalistic-modern-house-garden.json

`"location": "경기도 양평군",` 이 줄을 찾아서, 바로 아래에 이 두 줄을 추가하세요:

```json
    "lat": 37.4913,
    "lng": 127.4874,
```

## data/projects/rooftop-kitchen-garden-seongsu.json

`"location":` 으로 시작하는 줄을 찾아서 (아마 "서울 성동구 성수동" 근처 값일 겁니다),
바로 아래에 이 두 줄을 추가하세요:

```json
    "lat": 37.5445,
    "lng": 127.0557,
```

(성수동 대략적인 중심 좌표입니다. 정확한 주소가 있으면 그 주소로 다시 좌표를 구해드릴 수 있습니다.)

## 형식 예시

수정 전:
```json
"category": "주택정원",
"location": "경기도 양평군",
"heroImage": "...",
```

수정 후:
```json
"category": "주택정원",
"location": "경기도 양평군",
"lat": 37.4913,
"lng": 127.4874,
"heroImage": "...",
```
