# Node Library

Each `.btt` file stores one node definition.

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
