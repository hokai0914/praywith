# PrayWith Weekly Schedule

순수 HTML/CSS/JavaScript로 만든 주간 시간표형 일정 체크 웹앱입니다. 모든 사용자는 고정된 Apps Script Web App URL을 통해 같은 Google Sheets `Schedules` 탭의 일정을 함께 봅니다.

## 파일 구성

- `index.html`: 화면 구조
- `styles.css`: 주간 시간표 UI
- `app.js`: 캘린더 렌더링, 등록, 삭제, 완료 체크, Apps Script API 통신
- `apps-script/Code.gs`: Google Apps Script 백엔드

## 공유 연결

프론트엔드는 [app.js](app.js)의 `CLIENT_CONFIG.apiUrl`에 고정된 `/exec` URL을 사용합니다.

```text
https://script.google.com/macros/s/AKfycbz6kJsh2DSwphvxkrFEpfzHGH7YkCPXtZ2ID0GowY-UBUe_wc0lTblTH5mJEY8-Pecviw/exec
```

API URL을 사용자별 `localStorage`에 저장하지 않으므로, 같은 웹페이지를 여는 사용자는 모두 같은 시트 데이터를 보게 됩니다.

## Google Sheets 및 Apps Script 설정

1. Google Sheets 문서를 만들거나 기존 문서를 엽니다.
2. 확장 프로그램 > Apps Script를 엽니다.
3. `apps-script/Code.gs` 내용을 Apps Script 편집기에 붙여 넣습니다.
4. 스크립트를 시트에 바인딩하지 않았다면 Script Properties에 `SCHEDULE_SPREADSHEET_ID`를 추가하고 시트 ID를 입력합니다.
5. Apps Script에서 `initializeSchedulesSheet` 함수를 한 번 실행해 `Schedules` 탭과 헤더를 준비합니다.
6. 배포 > 새 배포 > 웹 앱을 선택합니다.
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
7. 배포된 Web App URL은 `/exec`로 끝나는 주소를 사용합니다.

Apps Script 코드를 수정한 뒤에는 기존 URL을 유지하기 위해 `Deploy > Manage deployments > Edit > New version > Deploy`로 같은 배포를 새 버전에 연결해야 합니다.

## 시트 스키마

`Schedules` 탭의 헤더는 다음 순서로 고정됩니다.

```text
id,date,time,personName,completed,createdAt,updatedAt
```

- 같은 `date + time` 조합은 중복 등록됩니다.
- 사람 1명당 1개의 행으로 저장됩니다.
- 완료 체크와 삭제는 `id` 기준으로 처리됩니다.

## 권한 모델

쓰기 비밀번호는 사용하지 않습니다. 웹페이지 링크를 아는 사용자는 누구나 일정 등록, 완료 체크, 삭제를 할 수 있습니다.
