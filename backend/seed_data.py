from models import (
    Drill,
    DrillCategory,
    DrillMastery,
    UserLevel,
    UserProfile,
    Workout,
    WorkoutSet,
)

DRILLS: list[Drill] = [
    Drill(
        id="drill-01",
        name="Высокий локоть (Catch-Up Drill)",
        youtube_id="T1OoKEfr_co",
        time_start=0,
        time_end=180,
        description="Упражнение на захват воды с высоким положением локтя. "
        "Одна рука остаётся впереди, пока вторая завершает полный гребок.",
        category=DrillCategory.technique,
    ),
    Drill(
        id="drill-02",
        name="Ротация корпуса (6-Kick Switch)",
        youtube_id="3MnVm1mNOzE",
        time_start=0,
        time_end=150,
        description="Шесть ударов ногами на боку, затем переход на другой бок. "
        "Развивает ротацию корпуса и баланс в воде.",
        category=DrillCategory.technique,
    ),
    Drill(
        id="drill-03",
        name="Дыхание: 3-3-3",
        youtube_id="JuzOGSTaqXo",
        time_start=0,
        time_end=120,
        description="Дыхание каждые 3 гребка с акцентом на выдох в воду. "
        "Три серии по три длины бассейна с минимальным отдыхом.",
        category=DrillCategory.technique,
    ),
    Drill(
        id="drill-04",
        name="Разминка плечевого пояса",
        youtube_id="s2GBTpGOGcY",
        time_start=0,
        time_end=200,
        description="Комплекс вращений и растяжки плечевого пояса перед основной тренировкой. "
        "Подготовка суставов и мышц к нагрузке.",
        category=DrillCategory.warmup,
    ),
    Drill(
        id="drill-05",
        name="Удары ногами с доской",
        youtube_id="g1sU18WHvYQ",
        time_start=0,
        time_end=240,
        description="Работа ногами с плавательной доской. "
        "Фокус на удар от бедра с минимальным сгибом в колене.",
        category=DrillCategory.strength,
    ),
    Drill(
        id="drill-06",
        name="Спринт на ногах (вертикальный)",
        youtube_id="PFS4fGaGWUY",
        time_start=0,
        time_end=160,
        description="Вертикальные удары ногами на глубокой воде. "
        "Развивает силу и выносливость мышц ног.",
        category=DrillCategory.strength,
    ),
    Drill(
        id="drill-07",
        name="Скольжение (Streamline Glide)",
        youtube_id="Bk3mqPnee2o",
        time_start=0,
        time_end=130,
        description="Отталкивание от стенки в обтекаемом положении. "
        "Максимальное скольжение без движений руками и ногами.",
        category=DrillCategory.technique,
    ),
    Drill(
        id="drill-08",
        name="Заминка: расслабленный брасс",
        youtube_id="RYEmeEGRRLo",
        time_start=0,
        time_end=300,
        description="Спокойный брасс в низком темпе для восстановления после тренировки. "
        "Акцент на длинное скольжение и расслабление.",
        category=DrillCategory.cooldown,
    ),
]

WORKOUTS: list[Workout] = [
    Workout(
        id="workout-01",
        name="Первые шаги в кроле",
        description="Базовая тренировка для начинающих пловцов. "
        "Знакомство с техникой и правильным дыханием.",
        level=UserLevel.novice,
        focus="техника и дыхание",
        sets=[
            WorkoutSet(drill_id="drill-04", distance_m=0, rest_seconds=60),
            WorkoutSet(drill_id="drill-07", distance_m=25, rest_seconds=30, repetitions=4),
            WorkoutSet(drill_id="drill-01", distance_m=25, rest_seconds=30, repetitions=4),
            WorkoutSet(drill_id="drill-03", distance_m=50, rest_seconds=45, repetitions=2),
            WorkoutSet(drill_id="drill-08", distance_m=100, rest_seconds=0),
        ],
    ),
    Workout(
        id="workout-02",
        name="Развитие гребка и ротации",
        description="Тренировка среднего уровня с фокусом на эффективный гребок "
        "и ротацию корпуса.",
        level=UserLevel.intermediate,
        focus="гребок и ротация корпуса",
        sets=[
            WorkoutSet(drill_id="drill-04", distance_m=0, rest_seconds=60),
            WorkoutSet(drill_id="drill-07", distance_m=50, rest_seconds=20, repetitions=4),
            WorkoutSet(drill_id="drill-01", distance_m=50, rest_seconds=20, repetitions=4),
            WorkoutSet(drill_id="drill-02", distance_m=50, rest_seconds=20, repetitions=4),
            WorkoutSet(
                drill_id="drill-05", distance_m=100, rest_seconds=30,
                repetitions=2, equipment="доска",
            ),
            WorkoutSet(drill_id="drill-03", distance_m=100, rest_seconds=30, repetitions=3),
            WorkoutSet(drill_id="drill-08", distance_m=200, rest_seconds=0),
        ],
    ),
    Workout(
        id="workout-03",
        name="Сила и скорость",
        description="Продвинутая тренировка с акцентом на силу ног и спринтерские навыки.",
        level=UserLevel.advanced,
        focus="сила ног и скорость",
        sets=[
            WorkoutSet(drill_id="drill-04", distance_m=0, rest_seconds=60),
            WorkoutSet(drill_id="drill-07", distance_m=50, rest_seconds=15, repetitions=6),
            WorkoutSet(
                drill_id="drill-05", distance_m=100, rest_seconds=20,
                repetitions=4, equipment="доска",
            ),
            WorkoutSet(drill_id="drill-06", distance_m=0, rest_seconds=30, repetitions=6),
            WorkoutSet(drill_id="drill-02", distance_m=100, rest_seconds=20, repetitions=4),
            WorkoutSet(drill_id="drill-01", distance_m=100, rest_seconds=20, repetitions=4),
            WorkoutSet(drill_id="drill-03", distance_m=200, rest_seconds=30, repetitions=2),
            WorkoutSet(drill_id="drill-08", distance_m=200, rest_seconds=0),
        ],
    ),
]

DEFAULT_USER = UserProfile(
    id="user-01",
    name="Пловец",
    level=UserLevel.novice,
    mastery={
        drill.id: DrillMastery(drill_id=drill.id)
        for drill in DRILLS
    },
    workout_history=[],
)
