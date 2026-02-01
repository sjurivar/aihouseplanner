<?php /** @var array $data */ ?>
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Health</title></head>
<body>
<h1>Status: <?= htmlspecialchars((string) ($data['status'] ?? 'ok')) ?></h1>
<p>Klokkeslett: <?= htmlspecialchars((string) ($data['timestamp'] ?? '')) ?></p>
</body>
</html>
