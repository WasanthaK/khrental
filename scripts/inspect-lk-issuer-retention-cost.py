"""Collect storage and billing evidence for the serving SQL database. Read-only."""
import datetime
import json
import os
import re
import subprocess
import sys

now = datetime.datetime.now(datetime.timezone.utc)
report = {"asOfUtc": now.isoformat(), "readOnly": True, "unavailable": {}}


def read_azure(label, *args):
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", "json"],
                            capture_output=True, text=True, timeout=65)
    if result.returncode:
        code = re.search(r"\b(AuthorizationFailed|Forbidden|ResourceNotFound|BadRequest|Invalid[A-Za-z]+)\b", result.stderr)
        report["unavailable"][label] = code.group(1) if code else "read_failed"
        return None
    return json.loads(result.stdout)


def collect(server, database):
    target = ["-g", os.environ["AZURE_RESOURCE_GROUP"], "-s", server.split(".")[0], "-n", database]
    db = read_azure("database", "sql", "db", "show", *target, "--query",
                    "{id:id,tier:sku.tier,sku:sku.name,maxSizeBytes:maxSizeBytes,"
                    "useFreeLimit:useFreeLimit,exhaustion:freeLimitExhaustionBehavior,elasticPoolId:elasticPoolId}")
    if db and db.get("id"):
        resource = db.pop("id")
        report["pooled"] = bool(db.pop("elasticPoolId", None))
        report["database"] = db
    else:
        subscription = read_azure("subscriptionContext", "account", "show", "--query", "id")
        if not subscription:
            return
        resource = (f"/subscriptions/{subscription}/resourceGroups/{os.environ['AZURE_RESOURCE_GROUP']}"
                    f"/providers/Microsoft.Sql/servers/{server.split('.')[0]}/databases/{database}")
    report["longTermRetention"] = read_azure("longTermRetention", "sql", "db", "ltr-policy", "show",
        *target, "--query",
        "{weekly:weeklyRetention,monthly:monthlyRetention,yearly:yearlyRetention}")

    start = (now - datetime.timedelta(days=4)).isoformat()
    for label, names in [("data", ["storage", "allocated_data_storage"]),
                         ("backups", ["full_backup_size_bytes", "diff_backup_size_bytes", "log_backup_size_bytes"])]:
        metrics = read_azure(label, "monitor", "metrics", "list", "--resource", resource, "--metrics", *names,
                             "--aggregation", "Maximum", "--interval", "P1D", "--start-time", start,
                             "--end-time", now.isoformat())
        if metrics is None:
            continue
        report[label] = {}
        for metric in metrics.get("value", []):
            samples = [point for series in metric.get("timeseries", []) for point in series.get("data", [])
                       if point.get("maximum") is not None and point.get("timeStamp")]
            if samples:
                latest = max(samples, key=lambda point: point["timeStamp"])
                report[label][metric["name"]["value"]] = {"latestUtc": latest["timeStamp"],
                    "latestMaximumBytes": latest["maximum"], "fourDayMaximumBytes": max(p["maximum"] for p in samples)}

    # Query only this database and omit all identifying or monetary account details from the artifact.
    scope = re.split("/providers/", resource, flags=re.I)[0]
    body = {"type":"ActualCost", "timeframe":"MonthToDate", "dataset":{"granularity":"None",
            "aggregation":{"amount":{"name":"PreTaxCost","function":"Sum"}},
            "filter":{"dimensions":{"name":"ResourceId","operator":"In","values":[resource]}},
            "grouping":[{"type":"Dimension","name":"Meter"}]}}
    costs = read_azure("billing", "rest", "--method", "post",
        "--url", f"https://management.azure.com{scope}/providers/Microsoft.CostManagement/query?api-version=2025-03-01",
        "--body", json.dumps(body))
    if costs:
        data = costs["properties"]
        columns = [column["name"] for column in data["columns"]]
        meters = {}
        for values in data["rows"]:
            row = dict(zip(columns, values))
            meter = row.get("Meter", "")
            if re.search("backup|storage", meter, re.I):
                meters[meter] = float(row["PreTaxCost"]) > 0 or meters.get(meter, False)
        report["monthToDate"] = {"hasUsageRows": bool(data["rows"]), "completePage": not data.get("nextLink"),
                                 "storageMetersWithPositiveCost": meters}


try:
    collect(*sys.argv[1:])
except (ValueError, KeyError, subprocess.SubprocessError):
    report["unavailable"]["collection"] = "incomplete"
print(json.dumps(report))
