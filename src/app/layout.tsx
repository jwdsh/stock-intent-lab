import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "析选｜自然语言策略工作台",
  description: "将模糊投资意图转换为可检查、可修改、可执行的数据条件。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
