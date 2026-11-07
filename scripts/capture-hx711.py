"""Opt-in DLOOP-SCALE-01 accepted-raw capture. Python stdlib + pyserial for USB only."""
import argparse
import csv
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
DEVICE = 'DLOOP-SCALE-01'
LABELS = {'EMPTY_STATIC': 'static', '275G_STATIC': 'static',
          'LOADING': 'loading', 'UNLOADING': 'unloading'}
FIELDS = ['device_id', 'sample_id', 'device_ms', 'raw', 'label', 'reset_before']


def node(script, *args):
    result = subprocess.run(['node', str(ROOT / script), *map(str, args)],
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def export(log, output, label, evidence):
    if not evidence.strip():
        raise ValueError('Independent label evidence required')
    if label not in LABELS:
        raise ValueError('Unsupported capture label')
    if Path(output).exists() or Path(str(output) + '.json').exists():
        raise FileExistsError(f'Refusing to overwrite {output} or metadata')
    identities = []
    for line in Path(log).read_text(encoding='utf-8', errors='replace').splitlines():
        if line.startswith('{'):
            try:
                frame = json.loads(line)
            except ValueError:
                continue
            if isinstance(frame, dict) and frame.get('v') == 1:
                identities.append(frame.get('deviceId'))
    if not identities or any(identity != DEVICE for identity in identities):
        raise ValueError('Log must contain only DLOOP-SCALE-01 v1 device identities')
    # No CSV is written until the entire capture passes the shared importer.
    data = node('scripts/scale-replay/import-capture.mjs', log)
    rows = [dict(device_id=DEVICE, sample_id=s['id'], device_ms=s['ms'],
                 raw=s['raw'], label=label,
                 reset_before=json.dumps(s.get('resetBefore', []))) for s in data['samples']]
    with open(output, 'x', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    Path(str(output) + '.json').write_text(json.dumps({
        'schemaVersion': 1, 'deviceId': DEVICE, 'source': 'recorded',
        'initialState': 'unknown', 'labelEvidence': evidence,
        'label': label, 'samples': len(rows), 'complete': True,
        'sourceLog': str(Path(log).resolve()),
        'csvSha256': hashlib.sha256(Path(output).read_bytes()).hexdigest(),
        'exportedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'timestampMeaning': 'MCU accepted read completion millis; not host/ADC conversion time'
    }, indent=2), encoding='utf-8')
    return len(rows)


def replay(csv_path, candidates=None):
    meta = json.loads(Path(str(csv_path) + '.json').read_text(encoding='utf-8'))
    if meta.get('complete') is not True or meta.get('deviceId') != DEVICE:
        raise ValueError('Complete DLOOP capture metadata required')
    if hashlib.sha256(Path(csv_path).read_bytes()).hexdigest() != meta.get('csvSha256'):
        raise ValueError('CSV integrity hash mismatch')
    with open(csv_path, newline='', encoding='utf-8') as file:
        rows = list(csv.DictReader(file))
    if len(rows) != meta['samples'] or not rows:
        raise ValueError('CSV sample count differs from complete capture')
    samples = []
    for row in rows:
        if row['device_id'] != DEVICE or row['label'] not in LABELS or row['label'] != meta['label']:
            raise ValueError('Invalid device or label')
        samples.append(dict(id=row['sample_id'], ms=int(row['device_ms']), raw=int(row['raw']),
                            label=LABELS[row['label']], resetBefore=json.loads(row['reset_before'])))
    data = dict(schemaVersion=1, name=Path(csv_path).stem, source='recorded',
                initialState='unknown', labelEvidence=meta['labelEvidence'], samples=samples)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'capture.json'
        path.write_text(json.dumps(data), encoding='utf-8')
        return node('scripts/replay-scale-stability.mjs', path, *([candidates] if candidates else []))


def capture(args):
    import serial  # Optional; offline export/replay needs no third-party Python modules.
    output = Path(args.output)
    log = Path(str(output) + '.log')
    for path in (output, log, Path(str(output) + '.json')):
        if path.exists():
            raise ValueError(f'Refusing to overwrite {path}')
    # Set control lines before opening to reduce automatic reset on common adapters.
    port = serial.Serial(port=None, baudrate=115200, timeout=0.2, write_timeout=2)
    port.dtr = False
    port.rts = False
    port.port = args.port
    with port, open(log, 'xb') as file:
        buffer = bytearray()

        def read_line():
            if b'\n' not in buffer:
                chunk = port.read(port.in_waiting or 1)
                file.write(chunk)
                file.flush()
                buffer.extend(chunk)
            if len(buffer) > 65536:
                raise ValueError('Serial line buffer overflow')
            if b'\n' not in buffer:
                return None
            line, _, tail = buffer.partition(b'\n')
            buffer[:] = tail
            return line.decode('utf-8', errors='replace').strip()

        # Read-only identity verification, including uncalibrated fault frames.
        deadline = time.monotonic() + 10
        while True:
            line = read_line()
            if line and line.startswith('{'):
                frame = json.loads(line)
                if frame.get('deviceId') != DEVICE:
                    raise ValueError('Unexpected serial device identity')
                if frame.get('v') == 1:
                    break
            if time.monotonic() > deadline:
                raise TimeoutError('No DLOOP-SCALE-01 v1 identity frame')
        # Warm up after opening/identity verification: adapter opening can reboot
        # the MCU. Keep draining serial on this same connection before BEGIN.
        warmup = getattr(args, 'warmup_seconds', 0)
        if warmup:
            print(f'Warming up for {warmup:g}s on {args.port}; keep EMPTY_STATIC conditions unchanged.', flush=True)
            warmup_deadline = time.monotonic() + warmup
            while time.monotonic() < warmup_deadline:
                line = read_line()
                if line and line.startswith('#DIAG BEGIN '):
                    raise ValueError('Existing trace during warm-up; stop it before retrying')
        # Log before BEGIN is retained; importer ignores production JSON.
        started = False
        try:
            port.write(b'DEBUG TRACE FULL\nDEBUG SNAPSHOT\n')
            deadline = time.monotonic() + 10
            while not started:
                line = read_line()
                if line and line.startswith('#DIAG BEGIN '):
                    started = True
                elif line and line.startswith('#DIAG END '):
                    raise ValueError('Prior/failed capture END received')
                if time.monotonic() > deadline:
                    raise TimeoutError('No BEGIN: stop any existing trace first')
            print(f'Capturing {args.label} for {args.seconds:g}s. Perform only the labelled activity.', flush=True)
            deadline = time.monotonic() + args.seconds
            while time.monotonic() < deadline:
                line = read_line()
                if line and line.startswith('#DIAG END '):
                    raise ValueError('Capture stopped early; log retained')
        finally:
            # Same write keeps tail SNAPSHOT/OFF commands together. Validation
            # still rejects a missing tail if firmware processes them separately.
            port.write(b'DEBUG SNAPSHOT\nDEBUG TRACE OFF\n')
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                line = read_line()
                if line and line.startswith('#DIAG END '):
                    break
    count = export(log, output, args.label, args.evidence)
    print(f'Complete: {count} accepted raw samples -> {output}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    cap = sub.add_parser('capture')
    cap.add_argument('--port', required=True)
    cap.add_argument('--seconds', type=float, default=30)
    cap.add_argument('--warmup-seconds', type=float, default=0,
                     help='Wait on the open verified connection before enabling trace')
    cap.add_argument('--output', required=True)
    cap.add_argument('--label', choices=LABELS, required=True)
    cap.add_argument('--evidence', required=True)
    conv = sub.add_parser('export', help='Validate and export an existing FULL log')
    conv.add_argument('--log', required=True)
    conv.add_argument('--output', required=True)
    conv.add_argument('--label', choices=LABELS, required=True)
    conv.add_argument('--evidence', required=True)
    rep = sub.add_parser('replay')
    rep.add_argument('csv')
    rep.add_argument('--candidates')
    args = parser.parse_args()
    if args.command == 'capture':
        if not 0 < args.seconds <= 600 or not 0 <= args.warmup_seconds <= 600 or not args.evidence.strip():
            parser.error('Use 0 < seconds <= 600, 0 <= warmup-seconds <= 600 and nonempty independent label evidence')
        capture(args)
    elif args.command == 'export':
        if not args.evidence.strip():
            parser.error('Independent label evidence required')
        print(f'Complete: {export(args.log, args.output, args.label, args.evidence)} samples')
    else:
        print(json.dumps(replay(args.csv, args.candidates), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TimeoutError, subprocess.CalledProcessError) as error:
        print(f'INCOMPLETE/FAILED: {error}', file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
