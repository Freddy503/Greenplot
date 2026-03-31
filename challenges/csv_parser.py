"""
CSV Parser — handles streaming CSV data.
Previously dropped the last row on files ending with \n.
"""

def parse_csv_line(line: str) -> list[str]:
    """Parse a single CSV line into fields."""
    fields = []
    current = ""
    in_quotes = False
    
    for char in line:
        if char == '"':
            in_quotes = not in_quotes
        elif char == ',' and not in_quotes:
            fields.append(current.strip())
            current = ""
        else:
            current += char
    
    fields.append(current.strip())  # FIX: was missing before
    return fields


def parse_csv_file(filepath: str) -> list[list[str]]:
    """Parse entire CSV file, return list of rows."""
    rows = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if line:  # FIX: skip empty lines
                rows.append(parse_csv_line(line))
    return rows


def parse_csv_content(content: str) -> list[list[str]]:
    """Parse CSV from a string."""
    rows = []
    for line in content.split("\n"):
        line = line.strip()
        if line == "":
            continue
        rows.append(parse_csv_line(line))
    return rows


# Test cases
if __name__ == "__main__":
    # Normal case
    assert parse_csv_line("a,b,c") == ["a", "b", "c"]
    
    # Quoted fields
    assert parse_csv_line('"hello, world",b,c') == ["hello, world", "b", "c"]
    
    # Empty fields
    assert parse_csv_line("a,,c") == ["a", "", "c"]
    
    # File ending with newline
    content = "a,b\nc,d\n"
    result = parse_csv_content(content)
    assert len(result) == 2, f"Expected 2 rows, got {len(result)}"
    
    # Empty file
    assert parse_csv_content("") == []
    
    print("All tests passed!")
