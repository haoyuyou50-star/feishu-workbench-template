from __future__ import annotations

import argparse
import json
from collections import defaultdict

from feishu_admin_client import FeishuAdminClient, configured_course_table

SCHEDULE_FIELD = "授课安排"


def text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "、".join(filter(None, (text(item) for item in value)))
    if isinstance(value, dict):
        return text(value.get("text") or value.get("name") or value.get("value"))
    return str(value).strip()


def unique(values):
    result = []
    for value in values:
        rendered = text(value)
        if rendered and rendered not in result:
            result.append(rendered)
    return result


def schedule_line(fields: dict) -> str:
    parts = [
        text(fields.get("星期")) or "时间待定",
        text(fields.get("周次范围")) or "周次待定",
        text(fields.get("节次范围")) or "节次待定",
        text(fields.get("上课地点")) or "地点待定",
        text(fields.get("周类型")) or "周类型待定",
    ]
    return "｜".join(parts)


def select_options(field: dict) -> list[dict]:
    return [
        {key: option[key] for key in ("id", "name", "color") if key in option}
        for option in field.get("property", {}).get("options", [])
        if option.get("name")
    ]


def ensure_select_option(cli, token: str, base: str, field: dict, option_name: str) -> None:
    options = select_options(field)
    if any(option.get("name") == option_name for option in options):
        return
    cli.request_json(
        "PUT",
        f"{base}/fields/{field['field_id']}",
        token=token,
        body={
            "field_name": field["field_name"],
            "type": field["type"],
            "property": {"options": [*options, {"name": option_name, "color": 0}]},
        },
    )


def merge_group(records: list[dict]) -> tuple[dict, list[str]]:
    ordered = sorted(
        records,
        key=lambda record: float(record.get("fields", {}).get("课程看板排序") or 10**9),
    )
    canonical = ordered[0]
    fields_list = [record.get("fields", {}) for record in ordered]
    merged = dict(canonical.get("fields", {}))

    for name in ("周次范围", "节次范围", "上课地点", "授课教师", "备注", "结课内容", "结课要求", "班委姓名", "小组成员", "联合作业课程"):
        values = unique(fields.get(name) for fields in fields_list)
        if values:
            merged[name] = "；".join(values)

    for name in ("课程类型", "星期", "结课类型", "结课状态", "提交方式", "看板颜色"):
        values = unique(fields.get(name) for fields in fields_list)
        if values:
            merged[name] = values[0]

    week_types = unique(fields.get("周类型") for fields in fields_list)
    if set(week_types) == {"单周", "双周"}:
        merged["周类型"] = "单双周"
    elif week_types:
        merged["周类型"] = week_types[0]

    for name in ("结课日期",):
        values = [fields.get(name) for fields in fields_list if fields.get(name) not in (None, "")]
        if values:
            merged[name] = values[0]

    merged["是否组队"] = any(bool(fields.get("是否组队")) for fields in fields_list)
    for name in ("工作看板排序", "课程看板排序"):
        values = [float(fields.get(name)) for fields in fields_list if fields.get(name) not in (None, "")]
        if values:
            merged[name] = int(min(values))

    merged[SCHEDULE_FIELD] = "\n".join(unique(schedule_line(fields) for fields in fields_list))
    course_types = unique(fields.get("课程类型") for fields in fields_list)
    if len(course_types) > 1:
        note = f"合并前课程类型：{'、'.join(course_types)}（当前按{merged['课程类型']}归类）"
        notes = unique([merged.get("备注"), note])
        merged["备注"] = "；".join(notes)

    canonical_id = canonical.get("record_id") or canonical.get("id")
    duplicate_ids = [
        record.get("record_id") or record.get("id")
        for record in ordered[1:]
    ]
    return {"record_id": canonical_id, "fields": merged}, duplicate_ids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    app_token, table_id = configured_course_table()
    cli = FeishuAdminClient()
    token = cli.get_tenant_access_token()
    base = f"/bitable/v1/apps/{app_token}/tables/{table_id}"
    field_result = cli.request_json("GET", f"{base}/fields?page_size=100", token=token)
    fields = field_result.get("data", {}).get("items", [])
    by_name = {field.get("field_name"): field for field in fields}

    created_schedule_field = False
    if SCHEDULE_FIELD not in by_name and args.apply:
        cli.request_json("POST", f"{base}/fields", token=token, body={"field_name": SCHEDULE_FIELD, "type": 1})
        created_schedule_field = True
    if "周类型" in by_name and args.apply:
        ensure_select_option(cli, token, base, by_name["周类型"], "单双周")

    record_result = cli.request_json("GET", f"{base}/records?page_size=500", token=token)
    records = record_result.get("data", {}).get("items", [])
    groups = defaultdict(list)
    for record in records:
        name = text(record.get("fields", {}).get("课程名称"))
        if name:
            groups[name].append(record)

    merge_plan = []
    normalized_single_schedules = 0
    for name, group in groups.items():
        if len(group) < 2:
            record = group[0]
            record_id = record.get("record_id") or record.get("id")
            record_fields = record.get("fields", {})
            if args.apply and not text(record_fields.get(SCHEDULE_FIELD)):
                cli.request_json(
                    "PUT",
                    f"{base}/records/{record_id}",
                    token=token,
                    body={"fields": {SCHEDULE_FIELD: schedule_line(record_fields)}},
                )
                normalized_single_schedules += 1
            continue
        canonical, duplicate_ids = merge_group(group)
        merge_plan.append({
            "course_name": name,
            "canonical_id": canonical["record_id"],
            "duplicate_ids": duplicate_ids,
            "schedule": canonical["fields"][SCHEDULE_FIELD],
            "course_type": text(canonical["fields"].get("课程类型")),
        })
        if not args.apply:
            continue
        cli.request_json(
            "PUT",
            f"{base}/records/{canonical['record_id']}",
            token=token,
            body={"fields": canonical["fields"]},
        )
        verified = cli.request_json("GET", f"{base}/records/{canonical['record_id']}", token=token)
        verified_fields = verified.get("data", {}).get("record", {}).get("fields", {})
        if text(verified_fields.get("课程名称")) != name or not text(verified_fields.get(SCHEDULE_FIELD)):
            raise RuntimeError(f"{name} 合并写入验证失败，未删除重复记录")
        for record_id in duplicate_ids:
            cli.request_json("DELETE", f"{base}/records/{record_id}", token=token)

    if args.apply:
        refreshed = cli.request_json("GET", f"{base}/records?page_size=500", token=token)
        refreshed_records = refreshed.get("data", {}).get("items", [])
        refreshed_groups = defaultdict(int)
        for record in refreshed_records:
            name = text(record.get("fields", {}).get("课程名称"))
            if name:
                refreshed_groups[name] += 1
        remaining_duplicates = {name: count for name, count in refreshed_groups.items() if count > 1}
        if remaining_duplicates:
            raise RuntimeError(f"仍有同名课程：{remaining_duplicates}")

    print(json.dumps({
        "applied": args.apply,
        "created_schedule_field": created_schedule_field,
        "merge_plan": merge_plan,
        "merged_course_count": len(merge_plan),
        "normalized_single_schedules": normalized_single_schedules,
        "deleted_duplicate_count": sum(len(item["duplicate_ids"]) for item in merge_plan) if args.apply else 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
