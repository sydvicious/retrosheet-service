#!/usr/bin/env python3
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
# Reduce a CSV on stdin to the comma-separated columns named in argv[1].
import csv
import sys

keep = sys.argv[1].split(",")
reader = csv.DictReader(sys.stdin)
writer = csv.DictWriter(sys.stdout, fieldnames=keep)
writer.writeheader()
for row in reader:
    writer.writerow({k: row.get(k, "") for k in keep})
