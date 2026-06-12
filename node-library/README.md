# Node Library

Each bundled `.btt` file stores one default node definition. Runtime imports are stored in the user's VS Code globalStorage `node-library` directory and merged with this bundled library when the extension loads.

Format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<node name="Switch2" category="Control" modelKind="Control" allowCustomAttributes="true">
  <input_port name="variable" default="" required="true" />
  <input_port name="case_1" default="" required="true" />
  <input_port name="case_2" default="" required="true" />
</node>
```

Supported folders:

- `Action`
- `Condition`
- `Control`
- `Decorator`
