[English](Troubleshooting) | [Русский](Troubleshooting-RU)

---

# Troubleshooting

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/troubleshooting_banner.svg" alt="FCC Troubleshooting">
</p>

This section is updated with solutions to common issues as they arise. If you encounter a problem not covered here, feel free to open an [Issue](https://github.com/LouisFahrenheit/Factorio-Control-Center/issues).

---

## Administrator Password Reset

If access to the administrator account is lost:

1. Stop the application.
2. In your `.env` file (or container environment), set:
   ```env
   FCC_ADMIN_USER=admin
   FCC_ADMIN_PASSWORD=NewPasswordHere
   ```
3. Start the application. Credentials will synchronize during startup.
4. Remove or comment out these environment variables in `.env` after logging in.
