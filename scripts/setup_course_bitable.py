from __future__ import annotations

import argparse
import json

from feishu_admin_client import FeishuAdminClient, configured_course_table


FIELD_SPECS = [
    {"field_name": "结课类型", "type": 3, "property": {"options": [{"name": "作业", "color": 5}, {"name": "考试", "color": 10}]}},
    {"field_name": "结课状态", "type": 3, "property": {"options": [
        {"name": "尚未填写结课信息", "color": 0},
        {"name": "未开始", "color": 1},
        {"name": "进行中", "color": 2},
        {"name": "待提交", "color": 10},
        {"name": "已完成", "color": 5},
    ]}},
    {"field_name": "结课内容", "type": 1},
    {"field_name": "结课要求", "type": 1},
    {"field_name": "结课日期", "type": 5, "property": {"date_formatter": "yyyy-MM-dd"}},
    {"field_name": "提交方式", "type": 3, "property": {"options": [
        {"name": "线下考试", "color": 10},
        {"name": "结课汇报", "color": 6},
        {"name": "畅课提交", "color": 5},
        {"name": "班委收集", "color": 3},
        {"name": "其他", "color": 0},
    ]}},
    {"field_name": "班委姓名", "type": 1},
    {"field_name": "是否组队", "type": 7},
    {"field_name": "小组成员", "type": 1},
    {"field_name": "联合作业课程", "type": 1},
    {"field_name": "看板颜色", "type": 1},
    {"field_name": "工作看板排序", "type": 2, "property": {"formatter": "0"}},
    {"field_name": "课程看板排序", "type": 2, "property": {"formatter": "0"}},
]


def main() -> None:
    parser = argparse.ArgumentParser(description="检查或初始化课程多维表格字段")
    parser.add_argument("--apply", action="store_true", help="执行字段创建和记录初始化；默认仅预览")
    args = parser.parse_args()
    app_token, table_id = configured_course_table()
    cli = FeishuAdminClient()
    token = cli.get_tenant_access_token()
    base = f"/bitable/v1/apps/{app_token}/tables/{table_id}"
    current = cli.request_json("GET", f"{base}/fields?page_size=100", token=token)
    existing = {item["field_name"] for item in current.get("data", {}).get("items", [])}
    created = []
    for field in FIELD_SPECS:
        if field["field_name"] in existing:
            continue
        if args.apply:
            result = cli.request_json("POST", f"{base}/fields", token=token, body=field)
            created.append(result.get("data", {}).get("field", {}).get("field_name", field["field_name"]))
        else:
            created.append(field["field_name"])

    records_result = cli.request_json("GET", f"{base}/records?page_size=500", token=token)
    records = records_result.get("data", {}).get("items", [])
    updates = []
    for index, record in enumerate(records):
        fields = record.get("fields", {})
        patch = {}
        if not fields.get("结课状态") and not fields.get("结课类型"):
            patch["结课状态"] = "尚未填写结课信息"
        if fields.get("工作看板排序") in (None, ""):
            patch["工作看板排序"] = index + 1
        if fields.get("课程看板排序") in (None, ""):
            patch["课程看板排序"] = index + 1
        if patch:
            updates.append({"record_id": record.get("record_id") or record.get("id"), "fields": patch})
    if args.apply:
        for start in range(0, len(updates), 500):
            cli.request_json("POST", f"{base}/records/batch_update", token=token, body={"records": updates[start:start + 500]})

    print(json.dumps({"applied": args.apply, "fields_to_create": created, "records_to_initialize": len(updates), "total_records": len(records)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
