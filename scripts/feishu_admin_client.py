"""Small standard-library Feishu client for optional Bitable maintenance scripts."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


BASE_URL = "https://open.feishu.cn/open-apis"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"缺少环境变量 {name}")
    return value


def configured_course_table() -> tuple[str, str]:
    return required_env("FEISHU_COURSES_APP_TOKEN"), required_env("FEISHU_COURSES_TABLE_ID")


class FeishuAdminClient:
    def __init__(self) -> None:
        self.app_id = required_env("FEISHU_APP_ID")
        self.app_secret = required_env("FEISHU_APP_SECRET")
        self._tenant_token = ""

    def request_json(self, method: str, path: str, *, token: str = "", body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json; charset=utf-8"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"飞书接口 HTTP {error.code}: {detail}") from error
        if int(result.get("code", 0) or 0) != 0:
            raise RuntimeError(f"飞书接口错误 {result.get('code')}: {result.get('msg', '未知错误')}")
        return result

    def get_tenant_access_token(self) -> str:
        if self._tenant_token:
            return self._tenant_token
        result = self.request_json(
            "POST",
            "/auth/v3/tenant_access_token/internal",
            body={"app_id": self.app_id, "app_secret": self.app_secret},
        )
        self._tenant_token = result.get("tenant_access_token", "")
        if not self._tenant_token:
            raise RuntimeError("飞书未返回 tenant_access_token")
        return self._tenant_token
