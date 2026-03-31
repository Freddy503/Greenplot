#!/usr/bin/env python3
import sys
import os
import datetime

def main():
    if len(sys.argv) < 5 or sys.argv[1] != '--job_name' or sys.argv[3] != '--output':
        print("Usage: python3 log_cron_output.py --job_name <job_name> --output <output>")
        sys.exit(1)
    
    job_name = sys.argv[2]
    output = sys.argv[4]
    
    # Create logs directory if it doesn't exist
    log_dir = "/root/.openclaw/workspace/logs"
    os.makedirs(log_dir, exist_ok=True)
    
    # Create log file with timestamp
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_file = os.path.join(log_dir, f"{job_name}_{timestamp}.log")
    
    with open(log_file, 'w') as f:
        f.write(f"Job: {job_name}\n")
        f.write(f"Timestamp: {datetime.datetime.now().isoformat()}\n")
        f.write(f"Output:\n{output}\n")
    
    print(f"Logged output to {log_file}")

if __name__ == "__main__":
    main()