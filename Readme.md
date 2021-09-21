# ecs-capacityproviders demo

## Bootstrap project with projen

```bash
$ git init
$ npx projen new awscdk-app-ts
```

This creates a `.projenrc.js` file

you can regenerate with

```bash
npx projen
```

```bash
pj build
```

Install dependencies
```bash
npx npm i
```

Add some packages:
```
npx npm install @aws-cdk/aws-certificatemanager 
```
## Locally test

```bash
npx cdk synth
```

```bash
npx cdk deploy
```