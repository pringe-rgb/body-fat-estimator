import "./globals.css";

export const metadata = {
  title: "눈바디 변화 다이어리",
  description: "전후 사진과 식단 기록을 쌓아 몸 변화를 흐름으로 보는 다이어리 앱"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
