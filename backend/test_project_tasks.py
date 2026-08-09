import runpy

import project_tasks as pt


def test_tasks_is_non_empty():
    assert len(pt.TASKS) > 0


def test_task_ids_are_unique():
    ids = [task.task_id for task in pt.TASKS]
    assert len(ids) == len(set(ids))


def test_all_tasks_have_valid_status_and_priority():
    for task in pt.TASKS:
        assert isinstance(task.status, pt.Status)
        assert isinstance(task.priority, pt.Priority)


def test_by_status_filters_correctly():
    done_tasks = pt.by_status(pt.Status.DONE)
    assert len(done_tasks) > 0
    assert all(task.status is pt.Status.DONE for task in done_tasks)


def test_by_status_empty_for_unused_combination():
    # every real Status value is exercised somewhere in TASKS; this
    # just confirms by_status doesn't error on a status with results
    blocked = pt.by_status(pt.Status.BLOCKED)
    assert all(task.status is pt.Status.BLOCKED for task in blocked)


def test_by_phase_filters_correctly():
    phase_tasks = pt.by_phase("phase-10")
    assert len(phase_tasks) > 0
    assert all(task.phase == "phase-10" for task in phase_tasks)


def test_by_phase_unknown_phase_returns_empty():
    assert pt.by_phase("phase-does-not-exist") == ()


def test_summary_contains_every_task_id():
    text = pt.summary()
    for task in pt.TASKS:
        assert task.task_id in text


def test_summary_returns_string():
    assert isinstance(pt.summary(), str)
    assert len(pt.summary()) > 0


def test_module_runs_as_script(capsys):
    runpy.run_path(pt.__file__, run_name="__main__")
    output = capsys.readouterr().out
    assert "CORE-01" in output
