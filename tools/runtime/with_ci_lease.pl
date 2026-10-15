#!/usr/bin/env perl
use strict;
use warnings;
use Fcntl qw(LOCK_EX LOCK_NB);
$| = 1;

my ($root, @command) = @ARGV;
die "CI_SHARED_LEASE_INVALID_COMMAND\n" unless $root && @command;
open my $git, '-|', 'git', '-C', $root, 'rev-parse', '--path-format=absolute', '--git-common-dir' or die $!;
chomp(my $common = <$git> // '');
close $git or die "CI_SHARED_LEASE_GIT_FAILED\n";
die "CI_SHARED_LEASE_NO_COMMON_DIR\n" unless -d $common;

# flock is shared by every worktree and released by the OS. Never remove a
# foreign/stale directory, PID file or server to obtain the resource.
open my $lease, '>>', "$common/pass-cycle-resource.lock" or die $!;
if (!flock($lease, LOCK_EX | LOCK_NB)) {
    print "CI_SHARED_LEASE_WAIT repository=$common\n";
    flock($lease, LOCK_EX) or die $!;
}
# Older checkouts have only their local PID lock. Respect an already-running
# legacy cycle, without changing any of its files or processes.
my $last_owner = '';
for (;;) {
    open my $list, '-|', 'git', '-C', $root, 'worktree', 'list', '--porcelain', '-z' or die $!;
    my @records;
    { local $/ = "\0"; @records = <$list>; }
    close $list or die "CI_SHARED_LEASE_WORKTREE_LIST_FAILED\n";
    my $busy = '';
    for my $record (@records) {
        next unless $record =~ /^worktree (.+)\0$/s;
        my $worktree = $1;
        next unless open my $owner, '<', "$worktree/.checkpoints/pass_cycle.lock/owner.pid";
        my $pid = <$owner> // '';
        close $owner;
        next unless $pid =~ /^([1-9][0-9]*)\s*$/;
        $pid = $1;
        next unless kill 0, $pid;
        open my $ps, '-|', 'ps', '-p', $pid, '-o', 'args=' or die $!;
        my $args = do { local $/; <$ps> // '' };
        close $ps;
        next unless $args =~ /\bbash\b.*\btools\/pass_cycle\.sh\b/;
        $busy = "pid=$pid worktree=$worktree";
        last;
    }
    last unless $busy;
    print "CI_SHARED_LEASE_WAIT legacy_$busy\n" if $busy ne $last_owner;
    $last_owner = $busy;
    sleep 2;
}

print "CI_SHARED_LEASE_ACQUIRED repository=$common\n";
$ENV{PASS_CYCLE_LEASE_OWNER} = $$;
$ENV{PASS_CYCLE_LEASE_ROOT} = $root;
system { $command[0] } @command;
my $status = $?;
exit($status == -1 ? 127 : ($status & 127) ? 128 + ($status & 127) : $status >> 8);
