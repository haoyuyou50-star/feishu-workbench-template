import type { Metadata } from "next";
import "./globals.css";

/* eslint-disable @next/next/no-sync-scripts -- Theme and Feishu SDK must be ready before the first client render. */

export const metadata: Metadata = {
  title: "个人工作台",
  description: "日程、任务、项目、便签与专注计时器",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="theme-color" content="#f3f6f3" />
        <script src="/liufeng-theme-runtime.js" />
        <script src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.16.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
