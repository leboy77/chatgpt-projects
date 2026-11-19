from pathlib import Path
import json
import sys

from openpyxl import load_workbook


source = Path(
    r"C:\Users\QZJLKJ\Downloads\7414"
    r"\Temu全球核价助手_导入模板_v2 (2).xlsx"
)
workbook = load_workbook(source, data_only=False, read_only=False)
sys.stdout.reconfigure(encoding="utf-8")

result = {
    "file": str(source),
    "sheets": [],
}

for worksheet in workbook.worksheets:
    rows = []
    for row in worksheet.iter_rows():
        values = [cell.value for cell in row]
        if not any(value not in (None, "") for value in values):
            continue
        rows.append(
            {
                "row": row[0].row,
                "values": values,
            }
        )
        if len(rows) >= 40:
            break
    result["sheets"].append(
        {
            "name": worksheet.title,
            "maxRow": worksheet.max_row,
            "maxColumn": worksheet.max_column,
            "mergedRanges": [
                str(cell_range) for cell_range in worksheet.merged_cells.ranges
            ],
            "rows": rows,
        }
    )

print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
