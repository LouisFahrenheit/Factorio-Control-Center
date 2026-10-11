[English](Troubleshooting) | [Русский](Troubleshooting-RU)

---

# Решение проблем

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/troubleshooting_banner.svg" alt="FCC Troubleshooting">
</p>

Этот раздел пополняется решениями частых проблем по мере их поступления. Если вашей проблемы нет в списке, вы можете открыть [Issue](https://github.com/LouisFahrenheit/Factorio-Control-Center/issues) в репозитории.

---

## Сброс пароля администратора

Если доступ к учетной записи администратора утерян:

1. Остановите панель.
2. В файле `.env` (или в переменных окружения контейнера) укажите:
   ```env
   FCC_ADMIN_USER=admin
   FCC_ADMIN_PASSWORD=NewPasswordHere
   ```
3. Запустите панель. Пароль обновится при инициализации.
4. После успешного входа удалите или закомментируйте указанные строки в `.env`.
