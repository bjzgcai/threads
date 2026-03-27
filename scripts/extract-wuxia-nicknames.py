#!/usr/bin/env python3
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def main():
	root_dir = Path(__file__).resolve().parents[1]
	docx_files = list(root_dir.glob("*.docx"))
	if not docx_files:
		raise SystemExit("No .docx file found in project root.")

	docx_path = docx_files[0]
	with zipfile.ZipFile(docx_path, "r") as zf:
		xml_bytes = zf.read("word/document.xml")

	root = ET.fromstring(xml_bytes)
	ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
	paragraphs = []
	for paragraph in root.findall(".//w:body/w:p", ns):
		text = "".join((node.text or "") for node in paragraph.findall(".//w:t", ns)).strip()
		if not text:
			continue
		outline = paragraph.find(".//w:outlineLvl", ns)
		level = int(outline.attrib.get("{%s}val" % ns["w"])) if outline is not None else None
		paragraphs.append((text, level))

	split_pattern = re.compile(r"[\u3001\uff0c,\u3002;；\s]+")
	groups = []
	current_group = None
	pending_novel = None
	for text, level in paragraphs:
		if level == 1:
			current_group = {"group": text.strip(), "novels": []}
			groups.append(current_group)
			pending_novel = None
			continue
		if level == 2 and current_group is not None:
			pending_novel = {
				"group": current_group["group"],
				"novel": text.strip().strip("《》"),
				"characters": [],
			}
			current_group["novels"].append(pending_novel)
			continue
		if pending_novel is not None and level is None:
			names = [item.strip() for item in split_pattern.split(text) if item.strip()]
			seen = set(pending_novel["characters"])
			for name in names:
				if name not in seen:
					seen.add(name)
					pending_novel["characters"].append(name)

	novels = [novel for group in groups for novel in group["novels"]]
	allowed_names = []
	seen_names = set()
	for novel in novels:
		for name in novel["characters"]:
			if name not in seen_names:
				seen_names.add(name)
				allowed_names.append(name)

	data = {
		"source": docx_path.name,
		"groups": groups,
		"novels": novels,
		"allowedNames": allowed_names,
	}

	output = root_dir / "src" / "data" / "wuxia-nicknames.json"
	output.parent.mkdir(parents=True, exist_ok=True)
	output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

	print(
		f"Saved {output} (groups={len(groups)}, novels={len(novels)}, names={len(allowed_names)})"
	)


if __name__ == "__main__":
	main()
