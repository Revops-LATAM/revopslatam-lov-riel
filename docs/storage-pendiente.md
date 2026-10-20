# Archivos de Storage pendientes

Los archivos viven en el Storage de Lovable Cloud (no en GitHub ni en el respaldo, que solo trae su registro).
**No cerrar el proyecto de Lovable hasta resolver esto.**

## marketing-assets: omitidos por ahora

| Ruta en el bucket                                                                    | Tamaño  | Importancia                                                                                                          |
| ------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `d90e7950-…/4c133045-…/linkedin/1783963374847-VS2_carrusel_educacio_n__frio_.pdf`    | 161 MB  | Alta: la pieza "Post 1" (carrusel) lo usa. Supera el límite de 50 MB del plan gratuito                               |
| `d90e7950-…/05d6ec55-…/1783113345082-_HubSpot__Salesforce_o_Pipedrive.pdf`           | 47,8 MB | Baja: ninguna fila de la base lo referencia                                                                          |
| `d90e7950-…/05d6ec55-…/instagram/1783114991048-_HubSpot__Salesforce_o_Pipedrive.pdf` | 47,8 MB | Baja: igual. Hay una copia subida en la raíz del bucket (ruta incorrecta, sin acceso para nadie) que conviene borrar |

Efecto mientras falten: en la grilla de marketing, la pieza "Post 1" mostrará sin poder abrir el PDF de LinkedIn.
No hay cambios de código pendientes por esto.

## Ya subidos (hasta donde se confirme)

`marketing-assets-listo.zip` contiene los 3 archivos recibidos, con su estructura de carpetas exacta.

## task-attachments

139 archivos (101 MB), pendientes. Los registros ya están en la tabla `task_attachments`; los archivos no.
Mantener las rutas tal cual: las políticas de acceso dependen de la primera carpeta.

## Cómo verificar al terminar

`select bucket_id, name from storage.objects order by name;` y comparar con la lista del respaldo.
