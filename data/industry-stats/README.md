# 조경 국가자격 산업 현황 원자료 (Industry Raw Data)

매거진그린 산업 현황 분석용으로 수집한 조경 관련 국가기술자격(조경기사·조경산업기사·조경기능사·조경기술사) 원자료입니다. Supabase(project: wxfvhsmelfffpxcktlnt)에서 매달 1일 자동 갱신되는 파이프라인의 스냅샷이며, 이 폴더는 그 결과를 클라우드 DB 밖에도 파일로 보관하기 위한 사본입니다.

## 파일 목록

### `kr_landscape_qual_acquirers.csv` (10,782행)
- **출처**: data.go.kr 공공데이터포털 "국가자격취득자현황" API (한국산업인력공단, service B490007)
- **내용**: 연·월 × 지역 × 연령대 × 성별로 세분화된 자격취득자 수
- **커버리지**: 2013~2024년 (단, 조경기사·조경산업기사는 2023년 이후 데이터 공백 있음 — API 자체의 한계로 확인됨)
- **컬럼**: `jm_cd,acquyy,acqumm,rgn_cd,age_grup_cd,gender_cd,acqu_cnt`
- 코드값은 아래 "코드 legend" 참고 (용량 절감을 위해 한글명 대신 코드로 저장)

### `kr_landscape_exam_stats.csv` (100행)
- **출처**: Q-Net(한국산업인력공단) 공개 페이지 "종목별 검정현황" (API 키 불필요)
- **내용**: 연도별 필기/실기 응시자·합격자·합격률
- **커버리지**: 2001~2025년 (4개 등급 × 25개년) — data.go.kr보다 최신
- **컬럼**: `jm_cd,jm_nm,exam_year,written_applicants,written_passers,written_pass_rate,practical_applicants,practical_passers,practical_pass_rate`

### `kr_landscape_kosis_acquirers.csv` (96행)
- **출처**: KOSIS(국가통계포털) Open API, tblId=DT_38701_N200_1 "종목별 취득자현황"
- **내용**: 연도별 최종 취득자수 (실기 합격자수와 동일 — 별도 공식 소스로 교차검증용)
- **커버리지**: 2002~2025년 (4개 등급 × 24개년)
- **컬럼**: `jm_cd,jm_nm,exam_year,acquirer_count`
- ⚠️ 2002년 값은 이례적으로 크게 나타남(예: 조경기능사 17,539명) — KOSIS 원자료 자체의 특성으로 보이며(1977~2001년 누적치가 첫 연도 컬럼에 합산되었을 가능성), 원인은 KOSIS 측에 명시되어 있지 않음. 분석 시 2002년 행은 별도 검토 권장.

## 코드 legend (kr_landscape_qual_acquirers.csv 전용)

**jm_cd (종목코드)**
| jm_cd | jm_nm |
|---|---|
| 1370 | 조경기사 |
| 2320 | 조경산업기사 |
| 7900 | 조경기능사 |
| 0670 | 조경기술사 |

**rgn_cd (지역코드)**
| rgn_cd | rgn_nm | rgn_cd | rgn_nm |
|---|---|---|---|
| 001 | 서울 | 010 | 전북 |
| 002 | 경기 | 011 | 경남 |
| 003 | 인천 | 012 | 울산 |
| 004 | 강원 | 013 | 부산 |
| 005 | 충북 | 014 | 광주 |
| 006 | 충남 | 015 | 전남 |
| 007 | 대전 | 016 | 제주 |
| 008 | 경북 | 017 | 세종 |
| 009 | 대구 | 999 | 지역미상 |

**age_grup_cd (연령대코드)**: 1=10대, 2=20대, 3=30대, 4=40대, 5=50대, 6=60대, 7=70대, 8=80대

**gender_cd (성별코드)**: F=여성, M=남성

## 자동 갱신 파이프라인 (참고용, Supabase 측)
- Edge Function: `fetch-kr-landscape-quals`, `fetch-kr-landscape-examstats`, `fetch-kr-landscape-kosis`
- 매달 1일 01:00 UTC(한국시간 10시)에 CCR Routine으로 자동 재실행되어 Supabase DB가 최신화됨
- 이 폴더의 CSV는 그 시점의 스냅샷이므로, 최신 데이터가 필요하면 재수출 요청 필요 (자동 동기화는 아님)

## 남은 과제
- 조경직 공무원 전국 모집 인원 (조사 진행 중)
- 조경업체 실적 데이터 (미착수)
