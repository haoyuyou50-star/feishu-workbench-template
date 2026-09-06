"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import ProjectManagement from "../../dashboard/project-management.jsx";

const subscribe = () => () => {};
export default function ProjectPreviewPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
    return <p>项目管理原型仅在本地开放。<Link href="/">返回工作台</Link></p>;
  }
  return <ProjectManagement />;
}
