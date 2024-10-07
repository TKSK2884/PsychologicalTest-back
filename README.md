# 심리테스트 (PsychologicalTest-back)
이 프로젝트는 심리테스트 프로젝트의 백엔드입니다. 사용자가 검사를 진행하거나 결과를 확인하고 저장하는 역할을 합니다.

## 📄 프로젝트 설명
- Open AI API와의 실시간 연결로 생성된 답변을 제공합니다.
- 테스트 정보를 DB에 JSON형식으로 저장하여 접근시 테스트를 제공합니다.
- 테스트중 이탈하여도 이어서 할수있도록 설계하였습니다.

## 🚀 프로젝트 데모
- [심리테스트 데모 페이지](https://mind.highground.kr/)

## 🔧 사용 기술 스택
Node.js, Express.js, MySQL, TypeScript

## 📌 주요 기능
- **회원 가입 및 로그인 기능**
- **카카오 로그인 지원**
- **심리 테스트 진행**
- **심리 테스트 결과값 반환**
- **이탈시 이어서 하기 가능**: 사용자가 테스트 도중 이탈하여도 중간값을 저장하여 이어서 테스트를 진행할 수 있게 하였습니다.
- **결과값 저장하기**: 사용자가 진행한 최근의 테스트들은 저장되고 이를 확인할 수 있습니다. 또한 비로그인 상태에서 진행한 테스트도 로그인시 저장할 수 있습니다.
- **데이터베이스와의 상호작용**

## 설치 및 실행

### 사전 요구 사항
- **Node.js** (v14 이상)
- **npm** 또는 **yarn**

### 설치

1. 저장소를 클론합니다.
```
git clone https://github.com/TKSK2884/psyTest-back.git
```

2. 의존성을 설치합니다.
```
npm install
# 또는
yarn install
```

3. .env 파일을 생성하고 다음 정보를 입력하세요
```
DB_SERVER_ADDR="localhost"
DB_USER="yourUser"
DB_PASSWORD="yourPassword"
DB="yourDB"
```
4. 백엔드 서버 실행
```
npm run start
# 또는
yarn start
```
5. API서버는 기본적으로 http://localhost:3000에서 실행됩니다.
