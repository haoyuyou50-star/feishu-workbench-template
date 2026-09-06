"use client";

import { useEffect, useState } from "react";
import PersonalWorkbench from "../dashboard/main.jsx";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return <PersonalWorkbench />;
}
