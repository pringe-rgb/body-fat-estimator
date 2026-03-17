import "./globals.css";

export const metadata = {
  title: "Body Fat Estimator",
  description: "Estimate body fat percentage from a body image using MediaPipe pose landmarks."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
