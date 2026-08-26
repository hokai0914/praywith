# PrayWith Schedule

순수 HTML/CSS/JavaScript로 만든 주간/월간 일정 체크 웹앱입니다. 데이터는 Firebase Firestore의 `schedules` 컬렉션에 저장합니다.

## 파일 구성

- `index.html`: 화면 구조
- `styles.css`: 주간 시간표 및 월간 달력 UI
- `app.js`: 캘린더 렌더링, 등록, 삭제, 완료 체크, Firestore 통신
- `firestore.rules`: 공개 읽기/쓰기 모델에 맞춘 Firestore 보안 규칙
- `scripts/import-schedules.mjs`: Google Sheets CSV를 Firestore로 1회 이관하는 스크립트
- `scripts/migrate-from-apps-script.mjs`: 기존 Apps Script Web App에서 Firestore로 직접 이관하는 스크립트
- `apps-script/Code.gs`: 이전 Google Sheets 백엔드 보관본

## Firebase 설정

1. Firebase Console에서 프로젝트를 만들고 Firestore Database를 생성합니다.
2. 프로젝트 설정 > 일반 > 내 앱에서 Web 앱을 추가합니다.
3. Firebase SDK 설정 객체를 복사해 `app.js`의 `CLIENT_CONFIG.firebase`에 입력합니다.

```js
const CLIENT_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
  collectionName: "schedules",
};
```

4. Firebase Console의 Firestore Rules에 `firestore.rules` 내용을 적용합니다.
5. 정적 파일을 기존 호스팅 또는 Firebase Hosting에 배포합니다.

`app.js`는 Firebase Web SDK를 CDN module import로 불러오므로 별도 프론트엔드 빌드가 필요 없습니다.

## Firestore 스키마

컬렉션 이름은 `schedules`입니다. 각 문서는 사람 1명의 기도 일정 1개를 나타냅니다.

```text
id,date,time,personName,completed,createdAt,updatedAt
```

- 문서 ID와 `id` 필드는 동일합니다.
- `date`는 `YYYY-MM-DD` 문자열입니다.
- `time`은 `HH:00` 문자열이며 등록은 `05:00`부터 `22:00`까지만 허용합니다.
- 같은 `date + time` 조합은 중복 등록됩니다.
- 완료 체크와 삭제는 `id` 기준으로 처리됩니다.

## 기존 Google Sheets 데이터 이관

기존 Apps Script Web App URL이 살아 있다면 다음 명령으로 바로 이관할 수 있습니다.

```sh
npm run migrate:apps-script -- --dry-run
npm run migrate:apps-script
```

기본 범위는 `2020-01-01`부터 `2030-12-31`까지입니다. 범위를 바꾸려면 다음처럼 실행합니다.

```sh
npm run migrate:apps-script -- --from 2026-06-01 --to 2026-08-31
```

CSV로 이관해야 할 때는 다음 절차를 사용합니다.

1. Google Sheets의 `Schedules` 탭을 CSV로 다운로드합니다.
2. Firebase Admin SDK 의존성을 설치합니다.

```sh
npm install
```

3. Firebase 서비스 계정 JSON을 준비하고 이관 전 검증을 실행합니다.

```sh
FIREBASE_SERVICE_ACCOUNT=./service-account.json npm run migrate:schedules -- ./Schedules.csv --dry-run
```

4. 문제가 없으면 실제 이관을 실행합니다.

```sh
FIREBASE_SERVICE_ACCOUNT=./service-account.json npm run migrate:schedules -- ./Schedules.csv
```

이관 스크립트는 기존 `id`를 Firestore 문서 ID로 보존합니다. 동일 ID 문서가 이미 있으면 덮어씁니다.

## 로컬 확인

정적 파일 서버로 확인합니다. `index.html`을 더블클릭해 `file://`로 열면 ES module/Firebase SDK 로딩이 막힐 수 있으므로 반드시 로컬 HTTP 서버로 여세요.

```sh
npm run serve
```

브라우저에서 `http://localhost:8000`을 엽니다. Firebase 설정이 비어 있으면 화면 상단에 `Firebase 설정 필요`가 표시되고 등록이 막힙니다.

기본 점검 순서는 다음과 같습니다.

1. 상단 상태가 `Firebase 연결됨`으로 표시되는지 확인합니다.
2. 기존 일정이 주간/월간 화면에 보이는지 확인합니다.
3. 테스트 일정을 하나 등록합니다.
4. 등록한 일정의 완료 체크를 켰다가 끕니다.
5. 등록한 테스트 일정을 삭제합니다.

## 권한 모델

현재 정책은 이전 Google Sheets 버전과 동일하게 링크를 아는 사용자가 읽기, 등록, 완료 체크, 삭제를 모두 할 수 있는 공개 모델입니다. `firestore.rules`는 `schedules` 컬렉션만 열고, 생성/수정 가능한 필드를 제한합니다.

삭제를 관리자만 허용하거나 로그인 사용자만 쓰게 하려면 Firebase Auth와 Rules 변경이 필요합니다.
